import AsyncStorage from '@react-native-async-storage/async-storage';
import { Picker } from '@react-native-picker/picker';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import '../languages/i18n';
import i18n from '../languages/i18n';
import { supabase } from '../supabase/supabaseClient';

const CROP_PRICES_API_URL =
  Constants.expoConfig?.extra?.EXPO_PUBIC_CROP_SUGGESTIONS_LINK ||
  Constants.manifest?.extra?.EXPO_PUBIC_CROP_SUGGESTIONS_LINK;

const base64ToUint8Array = (base64) => {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

export default function AddProduce() {
  const { t } = useTranslation();
  const router = useRouter();
  const [languageLoaded, setLanguageLoaded] = useState(false);
  
  const [selectedImage, setSelectedImage] = useState(null);
  const [fileName, setFileName] = useState('');
  const [cropName, setCropName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [pricePerKg, setPricePerKg] = useState('');
  const [type, setType] = useState('vegetable');
  const [loading, setLoading] = useState(false);

  const [priceSuggestions, setPriceSuggestions] = useState(null);
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [fetchingPrices, setFetchingPrices] = useState(false);
  const [userLocation, setUserLocation] = useState({ lat: 13.01, lon: 77.07 });

  const [webAlert, setWebAlert] = useState({ visible: false, type: '', message: '' });

  // Initialize language from AsyncStorage
  useEffect(() => {
    const initializeLanguage = async () => {
      try {
        const storedLanguage = await AsyncStorage.getItem('userLanguage');
        if (storedLanguage) {
          i18n.changeLanguage(storedLanguage);
        }
      } catch (error) {
        console.error('Error loading language:', error);
      } finally {
        setLanguageLoaded(true);
      }
    };
    
    initializeLanguage();
  }, []);

  const showMessage = (title, message, type = 'info') => {
    if (Platform.OS === 'web') {
      setWebAlert({ visible: true, type, message: `${title}: ${message}` });
      setTimeout(() => setWebAlert({ visible: false, type: '', message: '' }), 2500);
    } else {
      Alert.alert(title, message);
    }
  };

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.7,
      });

      if (!result.canceled && result.assets.length > 0) {
        setSelectedImage(result.assets[0]);
        const uriParts = result.assets[0].uri.split('/');
        setFileName(uriParts[uriParts.length - 1]);
      }
    } catch (error) {
      showMessage(t('common.error'), error.message, 'error');
    }
  };

  // Function to remove selected image
  const removeImage = () => {
    setSelectedImage(null);
    setFileName('');
  };

  const fetchCropPrices = async () => {
    if (!cropName.trim()) {
      showMessage(t('common.error'), t('addProduce.errorMessages.enterCropName'), 'error');
      return;
    }

    if (!CROP_PRICES_API_URL) {
      showMessage(t('common.error'), 'Crop prices API URL not defined', 'error');
      return;
    }

    setFetchingPrices(true);
    try {
      const response = await fetch(
        `${CROP_PRICES_API_URL}/crop-prices?lat=${userLocation.lat}&lon=${userLocation.lon}&crop=${encodeURIComponent(cropName)}`
      );

      if (!response.ok) {
        throw new Error(t('addProduce.errorMessages.fetchPricesError', { error: response.statusText }));
      }

      const data = await response.json();
      setPriceSuggestions(data);
      setShowPriceModal(true);
    } catch (error) {
      showMessage(t('common.error'), error.message, 'error');
    } finally {
      setFetchingPrices(false);
    }
  };

  const handlePriceSelect = (price) => {
    setPricePerKg(price.toString());
    setShowPriceModal(false);
  };

  const uploadImageAndSaveProduce = async () => {
    if (!selectedImage) {
      showMessage(t('common.error'), t('addProduce.errorMessages.selectImage'), 'error');
      return;
    }
    if (!cropName.trim() || !quantity.trim() || !pricePerKg.trim()) {
      showMessage(t('common.error'), t('addProduce.errorMessages.fillAllFields'), 'error');
      return;
    }

    setLoading(true);
    try {
      const farmer_id = await AsyncStorage.getItem('userId');
      if (!farmer_id) {
        showMessage(t('common.error'), t('addProduce.errorMessages.userNotLoggedIn'), 'error');
        setLoading(false);
        return;
      }

      const mimeType = selectedImage.type || 'image/jpeg';
      const fileExt = mimeType.includes('/') ? mimeType.split('/')[1] : 'jpg';
      const fileName = `produce_${Date.now()}.${fileExt}`;
      const bucketName = 'produce-images';

      let uploadResult;
      if (Platform.OS === 'web') {
        const response = await fetch(selectedImage.uri);
        const blob = await response.blob();
        uploadResult = await supabase.storage.from(bucketName).upload(fileName, blob, { upsert: false, contentType: mimeType });
      } else {
        const base64Data = await FileSystem.readAsStringAsync(selectedImage.uri, { encoding: FileSystem.EncodingType.Base64 });
        const fileData = base64ToUint8Array(base64Data);
        uploadResult = await supabase.storage.from(bucketName).upload(fileName, fileData, { upsert: false, contentType: mimeType });
      }

      if (uploadResult.error) throw uploadResult.error;

      const { data: publicUrlData } = supabase.storage.from(bucketName).getPublicUrl(fileName);
      const image_url = publicUrlData.publicUrl;

      const { error: insertError } = await supabase.from('produce').insert([{
        farmer_id,
        crop_name: cropName.trim(),
        quantity: parseInt(quantity, 10),
        price_per_kg: parseFloat(pricePerKg),
        image_url,
        type,
        status: 'in_stock',
      }]);

      if (insertError) throw insertError;

      showMessage(t('common.success'), t('addProduce.successMessage'), 'success');

      setSelectedImage(null);
      setFileName('');
      setCropName('');
      setQuantity('');
      setPricePerKg('');
      setType('vegetable');

      setTimeout(() => router.push('/(tabs)/farmerDashboard'), 2000);
    } catch (error) {
      showMessage(t('common.error'), error.message, 'error');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // Show loading state until language is loaded
  if (!languageLoaded) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4CAF50" />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      {/* Header with gradient background */}
      <View style={styles.headerContainer}>
        <Text style={styles.title}>{t('addProduce.title')}</Text>
        <Text style={styles.subtitle}>{t('addProduce.subtitle')}</Text>
      </View>

      {/* Web styled alert */}
      {webAlert.visible && (
        <View style={[styles.webAlert, webAlert.type === 'success' ? styles.successAlert : styles.errorAlert]}>
          <Text style={styles.webAlertText}>{webAlert.message}</Text>
        </View>
      )}

      <View style={styles.formContainer}>
        <Text style={styles.label}>{t('addProduce.cropName')}</Text>
        <View style={styles.cropNameContainer}>
          <TextInput
            value={cropName}
            onChangeText={setCropName}
            placeholder={t('addProduce.cropNamePlaceholder')}
            style={[styles.input, styles.cropNameInput]}
            editable={!loading}
          />
          <TouchableOpacity
            style={[styles.getPriceBtn, fetchingPrices || !cropName.trim() ? styles.disabledBtn : {}]}
            onPress={fetchCropPrices}
            disabled={fetchingPrices || !cropName.trim()}
          >
            {fetchingPrices ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.getPriceText}>{t('addProduce.getPrice')}</Text>}
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>{t('addProduce.quantity')}</Text>
        <TextInput
          value={quantity}
          onChangeText={setQuantity}
          placeholder={t('addProduce.quantityPlaceholder')}
          keyboardType="numeric"
          style={styles.input}
          editable={!loading}
        />

        <Text style={styles.label}>{t('addProduce.pricePerKg')}</Text>
        <TextInput
          value={pricePerKg}
          onChangeText={setPricePerKg}
          placeholder={t('addProduce.pricePlaceholder')}
          keyboardType="numeric"
          style={styles.input}
          editable={!loading}
        />

        <Text style={styles.label}>{t('addProduce.type')}</Text>
        <View style={styles.pickerContainer}>
          <Picker selectedValue={type} onValueChange={setType} style={styles.picker} enabled={!loading}>
            <Picker.Item label={t('common.vegetable')} value="vegetable" />
            <Picker.Item label={t('common.fruit')} value="fruit" />
          </Picker>
        </View>

        <TouchableOpacity style={styles.imagePickerBtn} onPress={pickImage} disabled={loading}>
          <Text style={styles.imagePickerText}>{t('addProduce.imagePickerText')}</Text>
        </TouchableOpacity>

        {/* Image preview with remove button */}
        {selectedImage && (
          <View style={styles.imagePreviewContainer}>
            <TouchableOpacity style={styles.removeImageButton} onPress={removeImage}>
              <Text style={styles.removeImageText}>✕</Text>
            </TouchableOpacity>
            <Image source={{ uri: selectedImage.uri }} style={styles.imagePreview} />
            <Text style={styles.fileName}>{t('addProduce.fileName', { fileName })}</Text>
          </View>
        )}

        {!selectedImage && (
          <Text style={styles.fileNamePlaceholder}>{t('addProduce.noImageSelected')}</Text>
        )}

        {loading ? (
          <ActivityIndicator size="large" color="#4CAF50" style={styles.loader} />
        ) : (
          <TouchableOpacity style={styles.submitBtn} onPress={uploadImageAndSaveProduce}>
            <Text style={styles.submitText}>{t('addProduce.submitText')}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Price Suggestions Modal */}
      <Modal visible={showPriceModal} animationType="slide" transparent={true} onRequestClose={() => setShowPriceModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {i18n.t('addProduce.priceSuggestionsTitle', { crop: cropName, state: priceSuggestions?.state })}
            </Text>

            <View style={styles.priceAnalysisContainer}>
              <Text style={styles.analysisTitle}>{i18n.t('addProduce.selectRecommendedPrice')}</Text>
              <View style={styles.analysisButtonsContainer}>
                <TouchableOpacity style={styles.analysisButton} onPress={() => handlePriceSelect(priceSuggestions?.analysis?.min_price)}>
                  <Text style={styles.analysisButtonText}>{i18n.t('addProduce.minPrice')}</Text>
                  <Text style={styles.analysisButtonValue}>₹{priceSuggestions?.analysis?.min_price}/kg</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.analysisButton, styles.recommendedButton]} onPress={() => handlePriceSelect(priceSuggestions?.analysis?.median_price)}>
                  <Text style={styles.analysisButtonText}>{i18n.t('addProduce.medianPrice')}</Text>
                  <Text style={styles.analysisButtonValue}>₹{priceSuggestions?.analysis?.median_price}/kg</Text>
                  <Text style={styles.recommendedLabel}>{i18n.t('addProduce.recommended')}</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.analysisButton} onPress={() => handlePriceSelect(priceSuggestions?.analysis?.max_price)}>
                  <Text style={styles.analysisButtonText}>{i18n.t('addProduce.maxPrice')}</Text>
                  <Text style={styles.analysisButtonValue}>₹{priceSuggestions?.analysis?.max_price}/kg</Text>
                </TouchableOpacity>
              </View>
            </View>

            <Text style={styles.marketTitle}>{i18n.t('addProduce.marketPrices')}</Text>
            <ScrollView style={styles.marketsContainer}>
              {priceSuggestions?.top5?.map((market, index) => (
                <TouchableOpacity key={index} style={styles.marketCard} onPress={() => handlePriceSelect(market.Modal_Price_num)}>
                  <View style={styles.marketInfo}>
                    <Text style={styles.marketName}>{market.Market}, {market.District}</Text>
                    <Text style={styles.marketDate}>{market.Arrival_Date}</Text>
                  </View>
                  <Text style={styles.marketPrice}>₹{market.Modal_Price_num}/kg</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity style={styles.closeModalBtn} onPress={() => setShowPriceModal(false)}>
              <Text style={styles.closeModalText}>{i18n.t('common.close')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // Main container with gradient background
  container: {
    flex: 1,
    backgroundColor: '#f4f9f4',
  },
  
  // Loading state
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f4f9f4',
  },
  
  // Header with gradient background
  headerContainer: {
    backgroundColor: '#4CAF50', // Changed from gradient to solid color
    paddingTop: 30,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 6,
  },
  
  // Title and subtitle
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 5,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#ffffff',
    textAlign: 'center',
    opacity: 0.9,
  },
  
  // Form container with card-like appearance
  formContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
  
  // Labels
  label: {
    fontWeight: '600',
    fontSize: 16,
    marginBottom: 8,
    color: '#2E7D32',
    letterSpacing: 0.3,
  },
  
  // Input fields
  input: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    fontSize: 16,
    marginBottom: 20,
    backgroundColor: '#FAFAFA',
    color: '#333333',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  
  // Crop name container with price button
  cropNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  cropNameInput: {
    flex: 1,
    marginRight: 12,
  },
  getPriceBtn: {
    backgroundColor: '#4CAF50',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 100,
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
  },
  getPriceText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 14,
  },
  disabledBtn: {
    backgroundColor: '#A0A0A0',
    shadowOpacity: 0,
    elevation: 0,
  },
  
  // Picker
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    marginBottom: 20,
    backgroundColor: '#FAFAFA',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  picker: { 
    height: 50, 
    width: '100%', 
    color: '#4CAF50',
  },
  
  // Image picker
  imagePickerBtn: {
    backgroundColor: '#4CAF50',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 15,
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
  },
  imagePickerText: { 
    color: '#ffffff', 
    fontWeight: '600', 
    fontSize: 16,
  },
  
  // Image preview
  imagePreviewContainer: {
    position: 'relative',
    alignItems: 'center',
    marginBottom: 15,
  },
  imagePreview: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  removeImageButton: {
    position: 'absolute',
    top: -10,
    right: -10,
    backgroundColor: '#F44336',
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 4,
  },
  removeImageText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    lineHeight: 18,
  },
  
  // File name
  fileName: {
    fontSize: 14,
    color: '#555555',
    marginBottom: 15,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  fileNamePlaceholder: {
    fontSize: 14,
    color: '#AAAAAA',
    marginBottom: 15,
    textAlign: 'center',
  },
  
  // Submit button
  submitBtn: {
    backgroundColor: '#8BC34A', // Changed from gradient to solid color
    paddingVertical: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 15,
    shadowColor: '#8BC34A', // Updated shadow color to match
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  submitText: { 
    color: '#ffffff', 
    fontWeight: '700', 
    fontSize: 16,
    letterSpacing: 0.5,
  },
  loader: { 
    marginVertical: 20,
  },

  // Web alert
  webAlert: {
    padding: 14,
    borderRadius: 8,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  webAlertText: {
    color: '#ffffff',
    fontWeight: '600',
    textAlign: 'center',
  },
  successAlert: { 
    backgroundColor: '#4CAF50',
  },
  errorAlert: { 
    backgroundColor: '#F44336',
  },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '90%',
    maxHeight: '80%',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 10,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2E7D32',
    marginBottom: 20,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  priceAnalysisContainer: {
    backgroundColor: '#E8F5E9',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#C8E6C9',
  },
  analysisTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2E7D32',
    marginBottom: 12,
    textAlign: 'center',
  },
  analysisButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  analysisButton: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  recommendedButton: {
    borderColor: '#4CAF50',
    borderWidth: 2,
    backgroundColor: '#E8F5E9',
  },
  analysisButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333333',
  },
  analysisButtonValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginTop: 6,
  },
  recommendedLabel: {
    fontSize: 12,
    color: '#4CAF50',
    fontWeight: '600',
    marginTop: 6,
    backgroundColor: '#C8E6C9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  marketTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333333',
    marginBottom: 12,
  },
  marketsContainer: {
    maxHeight: 200,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 10,
    padding: 8,
  },
  marketCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F9F9F9',
    borderRadius: 8,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  marketInfo: {
    flex: 1,
  },
  marketName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333333',
  },
  marketDate: {
    fontSize: 13,
    color: '#666666',
    marginTop: 2,
  },
  marketPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  closeModalBtn: {
    backgroundColor: '#4CAF50',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  closeModalText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 16,
  },
});