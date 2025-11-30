import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Picker } from "@react-native-picker/picker";
import { useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { supabase } from "../supabase/supabaseClient";

// Custom Alert Component
const CustomAlert = ({ visible, title, message, buttons, onClose }) => {
  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={alertStyles.overlay}>
        <View style={alertStyles.alertContainer}>
          <Text style={alertStyles.alertTitle}>{title}</Text>
          <Text style={alertStyles.alertMessage}>{message}</Text>
          <View style={alertStyles.buttonContainer}>
            {buttons.map((button, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  alertStyles.alertButton,
                  button.style === "destructive" && alertStyles.destructiveButton
                ]}
                onPress={() => {
                  button.onPress && button.onPress();
                  onClose && onClose();
                }}
              >
                <Text style={[
                  alertStyles.alertButtonText,
                  button.style === "destructive" && alertStyles.destructiveButtonText
                ]}>
                  {button.text}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
};

// Cross-platform simple alert
const showAlert = (title, message, onOk) => {
  if (Platform.OS === "web") {
    window.alert(`${title}\n${message}`);
    if (onOk) onOk();
  } else {
    Alert.alert(title, message, [{ text: "OK", onPress: onOk }]);
  }
};

// Cross-platform confirm alert
const showConfirm = (title, message, onConfirm) => {
  if (Platform.OS === "web") {
    const confirmed = window.confirm(`${title}\n${message}`);
    if (confirmed && onConfirm) onConfirm();
  } else {
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel" },
      { text: "Logout", style: "destructive", onPress: onConfirm },
    ]);
  }
};

export default function RetailerDashboard() {
  const { t } = useTranslation();
  const [produceList, setProduceList] = useState([]);
  const [filteredProduce, setFilteredProduce] = useState([]);
  const [retailerName, setRetailerName] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedProduce, setSelectedProduce] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOption, setSortOption] = useState("none");
  const [sortModalVisible, setSortModalVisible] = useState(false);
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState({
    title: "",
    message: "",
    buttons: []
  });
  const navigation = useNavigation();

  // Show custom alert
  const showCustomAlert = (title, message, buttons) => {
    setAlertConfig({ title, message, buttons });
    setAlertVisible(true);
  };

  // Hide custom alert
  const hideCustomAlert = () => {
    setAlertVisible(false);
  };

  useEffect(() => {
    fetchRetailerInfo();
    fetchInStockProduce();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [searchQuery, sortOption, produceList]);

  // Fetch retailer name
  const fetchRetailerInfo = async () => {
    try {
      const retailerId = await AsyncStorage.getItem("userId");
      if (!retailerId) return;
      const { data, error } = await supabase
        .from("profiles")
        .select("name")
        .eq("id", retailerId)
        .single();
      if (!error) {
        setRetailerName(data?.name || t('retailer'));
      }
    } catch (err) {
      console.error("Error retrieving retailer info:", err);
    }
  };

  // Fetch in-stock produce
  const fetchInStockProduce = async () => {
    setLoading(true);
    const { data: produceData, error: produceError } = await supabase
      .from("produce")
      .select(
        "id, crop_name, quantity, price_per_kg, status, image_url, farmer_id"
      )
      .eq("status", "in_stock");

    if (produceError) {
      showAlert(t('error'), t('failedToLoadProduce'));
      setLoading(false);
      return;
    }

    const farmerIds = [...new Set(produceData.map((p) => p.farmer_id))];
    const { data: farmerData } = await supabase
      .from("profiles")
      .select("id, name")
      .in("id", farmerIds);

    const farmerDict = {};
    (farmerData || []).forEach((farmer) => {
      farmerDict[farmer.id] = farmer.name;
    });

    const mergedList = produceData.map((produce) => ({
      ...produce,
      farmer_name: farmerDict[produce.farmer_id] || t('unknown'),
    }));

    setProduceList(mergedList);
    setLoading(false);
  };

  // Apply search + sort
  const applyFilters = () => {
    let updatedList = [...produceList];
    if (searchQuery) {
      updatedList = updatedList.filter((item) =>
        item.crop_name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    if (sortOption === "asc") {
      updatedList.sort((a, b) => a.price_per_kg - b.price_per_kg);
    } else if (sortOption === "desc") {
      updatedList.sort((a, b) => b.price_per_kg - a.price_per_kg);
    }
    setFilteredProduce(updatedList);
  };

  // Add crop to cart
  const addToCart = async (cropId) => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        showCustomAlert(
          t('error'),
          t('pleaseLoginToAddToCart'),
          [{ text: t('ok'), onPress: () => {} }]
        );
        return;
      }
      const { data: cropData } = await supabase
        .from("produce")
        .select("price_per_kg")
        .eq("id", cropId)
        .single();
      await supabase.from("cart").insert([
        {
          retailer_id: user.id,
          crop_id: cropId,
          quantity: 1,
          price_per_kg: cropData.price_per_kg,
        },
      ]);
      showCustomAlert(
        t('success'),
        t('itemAddedToCart'),
        [{ text: t('ok'), onPress: () => {} }]
      );
    } catch (err) {
      showCustomAlert(
        t('error'),
        t('somethingWentWrong'),
        [{ text: t('ok'), onPress: () => {} }]
      );
    }
  };

  // Logout function
  const handleLogout = async () => {
    showCustomAlert(
      t('logout'),
      t('areYouSureLogout'),
      [
        { text: t('cancel'), onPress: () => {} },
        { text: t('logout'), style: "destructive", onPress: async () => {
          try {
            await AsyncStorage.clear();
            await supabase.auth.signOut();
            navigation.replace("(tabs)/login");
          } catch (err) {
            console.warn("Logout error:", err);
            showCustomAlert(
              t('error'),
              t('logoutFailed'),
              [{ text: t('ok'), onPress: () => {} }]
            );
          }
        }}
      ]
    );
  };

  // Open/close details modal
  const openDetails = (produce) => setSelectedProduce(produce);
  const closeDetails = () => setSelectedProduce(null);

  // Render each produce card - updated with Add to Cart button
  const renderCard = (item) => (
    <TouchableOpacity 
      onPress={() => openDetails(item)} 
      activeOpacity={0.85}
      style={styles.cardContainer}
    >
      <View style={styles.card}>
        <View style={styles.cardImageContainer}>
          <Image
            source={{ uri: item.image_url || "https://via.placeholder.com/150" }}
            style={styles.image}
          />
          <View style={styles.priceBadge}>
            <Text style={styles.priceText}>₹{item.price_per_kg}/kg</Text>
          </View>
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.cropName} numberOfLines={1}>{item.crop_name}</Text>
          <View style={styles.detailsRow}>
            <Feather name="package" size={14} color="#4A6FA5" />
            <Text style={styles.details}>{item.quantity} kg</Text>
          </View>
          <View style={styles.farmerRow}>
            <Feather name="user" size={14} color="#4A6FA5" />
            <Text style={styles.farmerName} numberOfLines={1}>{item.farmer_name}</Text>
          </View>
          
          {/* Add to Cart Button */}
          <TouchableOpacity 
            style={styles.addToCartButton}
            onPress={(e) => {
              e.stopPropagation();
              addToCart(item.id);
            }}
          >
            <Text style={styles.addToCartText}>{t('addToCart')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <LinearGradient colors={["#4A6FA5", "#2C4C7C"]} style={styles.header}>
        <View style={styles.leftHeader}>
          <View style={styles.avatarContainer}>
            <Text style={styles.bigEmoji}>🧑</Text>
          </View>
          <View>
            <Text style={styles.welcomeText}>{t('welcome')}</Text>
            <Text style={styles.retailerName}>{retailerName}</Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: 10 }}>
          {/* Notification button */}
          <TouchableOpacity
            onPress={() => navigation.navigate("services/Notification")}
            style={styles.iconButton}
          >
            <Feather name="bell" size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleLogout} style={styles.iconButton}>
            <Feather name="log-out" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {/* Search and Filter */}
      <View style={styles.searchRow}>
        <View style={styles.searchContainer}>
          <Feather name="search" size={20} color="#4A6FA5" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder={t('searchCrops')}
            placeholderTextColor="#757575"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
        <TouchableOpacity
          onPress={() => setSortModalVisible(true)}
          style={styles.filterButton}
        >
          <Feather name="filter" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Produce List - Updated for two squares that fill the row */}
      <View style={styles.scrollContainer}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <Text style={styles.loading}>{t('loadingProduce')}</Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.gridContent}
            showsVerticalScrollIndicator={false}
            // Web-specific props
            style={Platform.OS === "web" ? { flex: 1, minHeight: 0 } : {}}
          >
            {filteredProduce.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Feather name="inbox" size={40} color="#4A6FA5" />
                <Text style={styles.emptyText}>{t('noProduceAvailable')}</Text>
              </View>
            ) : (
              // Create pairs of cards for two per row
              filteredProduce.reduce((acc, item, index) => {
                if (index % 2 === 0) {
                  acc.push([item]);
                } else {
                  acc[acc.length - 1].push(item);
                }
                return acc;
              }, []).map((pair, rowIndex) => (
                <View key={rowIndex} style={styles.rowContainer}>
                  {pair.map((item) => (
                    <View key={item.id} style={styles.cardWrapper}>
                      {renderCard(item)}
                    </View>
                  ))}
                </View>
              ))
            )}
          </ScrollView>
        )}
      </View>

      {/* Sort Modal */}
      <Modal visible={sortModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <LinearGradient colors={["#FFFFFF", "#F5F7FA"]} style={styles.sortModalCard}>
            <Text style={styles.modalTitle}>{t('sortByPrice')}</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={sortOption}
                style={styles.picker}
                dropdownIconColor="#dadfe8ff"
                onValueChange={(value) => {
                  setSortOption(value);
                  setSortModalVisible(false);
                }}
              >
                <Picker.Item label={t('none')} value="none" />
                <Picker.Item label={t('lowToHigh')} value="asc" />
                <Picker.Item label={t('highToLow')} value="desc" />
              </Picker>
            </View>
            <TouchableOpacity
              style={styles.closeButtonContainer}
              onPress={() => setSortModalVisible(false)}
            >
              <LinearGradient
                colors={["#FF6B6B", "#FF8E53"]}
                style={styles.closeButtonGradient}
              >
                <Text style={styles.closeText}>{t('close')}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </LinearGradient>
        </View>
      </Modal>

      {/* Details Modal */}
      <Modal visible={!!selectedProduce} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <LinearGradient colors={["#FFFFFF", "#F5F7FA"]} style={styles.modalCard}>
            <ScrollView 
              contentContainerStyle={styles.modalScrollContent}
              // Web-specific props
              style={Platform.OS === "web" ? { maxHeight: "80vh" } : {}}
            >
              <Image
                source={{
                  uri:
                    selectedProduce?.image_url ||
                    "https://via.placeholder.com/300",
                }}
                style={styles.modalImage}
              />
              <Text style={styles.modalTitle}>
                {selectedProduce?.crop_name}
              </Text>
              <View style={styles.modalDetailsContainer}>
                <View style={styles.modalDetailRow}>
                  <Feather name="package" size={20} color="#4A6FA5" />
                  <Text style={styles.modalDetails}>
                    {t('quantity', { qty: selectedProduce?.quantity })}
                  </Text>
                </View>
                <View style={styles.modalDetailRow}>
                  <Feather name="dollar-sign" size={20} color="#4A6FA5" />
                  <Text style={styles.modalDetails}>
                    {t('price', { price: selectedProduce?.price_per_kg })}
                  </Text>
                </View>
                <View style={styles.modalDetailRow}>
                  <Feather name="user" size={20} color="#4A6FA5" />
                  <Text style={styles.modalDetails}>
                    {t('farmer', { name: selectedProduce?.farmer_name })}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.modalButton}
                onPress={() => {
                  addToCart(selectedProduce.id);
                  closeDetails();
                }}
              >
                <Feather name="shopping-cart" size={20} color="#fff" />
                <Text style={styles.modalButtonText}>{t('addToCart')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.closeButtonContainer}
                onPress={closeDetails}
              >
                <LinearGradient
                  colors={["#FF6B6B", "#FF8E53"]}
                  style={styles.closeButtonGradient}
                >
                  <Text style={styles.closeText}>{t('close')}</Text>
                </LinearGradient>
              </TouchableOpacity>
            </ScrollView>
          </LinearGradient>
        </View>
      </Modal>

      {/* Bottom Navigation */}
      <LinearGradient colors={["#FFFFFF", "#F5F7FA"]} style={styles.bottomNav}>
        <TouchableOpacity
          style={styles.navItem}
          onPress={() => navigation.navigate("RetailerDashboard")}
        >
          <Feather name="home" size={22} color="#4A6FA5" />
          <Text style={styles.navText}>{t('home')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.navItem}
          onPress={() => navigation.navigate("drawer/add_to_cart")}
        >
          <Feather name="shopping-cart" size={22} color="#4A6FA5" />
          <Text style={styles.navText}>{t('cart')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.navItem}
          onPress={() => navigation.navigate("drawer/Order")}
        >
          <Feather name="package" size={22} color="#4A6FA5" />
          <Text style={styles.navText}>{t('orders')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.navItem}
          onPress={() => navigation.navigate("drawer/profile")}
        >
          <Feather name="user" size={22} color="#4A6FA5" />
          <Text style={styles.navText}>{t('profile_retailer')}</Text>
        </TouchableOpacity>
      </LinearGradient>

      {/* Custom Alert */}
      <CustomAlert
        visible={alertVisible}
        title={alertConfig.title}
        message={alertConfig.message}
        buttons={alertConfig.buttons}
        onClose={hideCustomAlert}
      />
    </View>
  );
}

// Alert Styles
const alertStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  alertContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    width: '80%',
    maxWidth: 300,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  alertTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333333',
    textAlign: 'center',
  },
  alertMessage: {
    fontSize: 16,
    marginBottom: 20,
    color: '#666666',
    textAlign: 'center',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  alertButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#4A6FA5',
    minWidth: 100,
    alignItems: 'center',
  },
  destructiveButton: {
    backgroundColor: '#E53935',
  },
  alertButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  destructiveButtonText: {
    color: '#FFFFFF',
  },
});

const styles = StyleSheet.create({
  // Main container - critical for web scrolling
  container: {
    flex: 1,
    backgroundColor: '#F5F7FA',
    // Web-specific fixes
    ...(Platform.OS === "web" && {
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }),
  },
  
  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 10,
    borderRadius: 16,
    marginHorizontal: 16,
    paddingVertical: 12,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    // Web-specific
    ...(Platform.OS === "web" && {
      flexShrink: 0,
    }),
  },
  
  leftHeader: { 
    flexDirection: "row", 
    alignItems: "center", 
    gap: 12 
  },
  
  avatarContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  
  bigEmoji: { 
    fontSize: 32 
  },
  
  welcomeText: { 
    fontSize: 16, 
    fontWeight: "500", 
    color: "rgba(255, 255, 255, 0.9)" 
  },
  
  retailerName: { 
    fontSize: 18, 
    fontWeight: "700", 
    color: "#FFFFFF" 
  },
  
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  
  // Search and Filter
  searchRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    marginBottom: 12,
    alignItems: "center",
    // Web-specific
    ...(Platform.OS === "web" && {
      flexShrink: 0,
    }),
  },
  
  searchContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "#DDE4ED",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    marginRight: 10,
  },
  
  searchIcon: {
    marginRight: 8,
  },
  
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: "#333333",
    paddingVertical: 10,
  },
  
  filterButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#b0c4c7ff",
    justifyContent: "center",
    alignItems: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  
  // Scroll container - critical for web scrolling
  scrollContainer: {
    flex: 1,
    // Web-specific fixes
    ...(Platform.OS === "web" && {
      minHeight: 0,
      overflow: 'hidden',
    }),
  },
  
  // Grid content - for two cards per row
  gridContent: {
    paddingHorizontal: 16,
    paddingBottom: 80,
    // Web-specific
    ...(Platform.OS === "web" && {
      minHeight: '100%',
    }),
  },
  
  // Row container for two cards
  rowContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    width: '100%',
  },
  
  // Card wrapper - ensures equal spacing
  cardWrapper: {
    width: '48.5%', // Slightly less than 50% to account for spacing
    aspectRatio: 1, // Ensures square shape
  },
  
  // Card container
  cardContainer: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
    overflow: 'hidden',
  },
  
  // Card - updated for square shape
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    overflow: "hidden",
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    borderWidth: 1,
    borderColor: "#E8EDF2",
    position: 'relative',
    width: '100%',
    height: '100%',
  },
  
  // Card image container
  cardImageContainer: {
    position: 'relative',
    height: '55%', // Reduced to make room for the button
  },
  
  // Image - updated for square shape
  image: { 
    width: '100%', 
    height: '100%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  
  // Price badge
  priceBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(74, 111, 165, 0.9)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  
  priceText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  
  // Card info - updated for square shape
  cardInfo: { 
    padding: 12, 
    height: '45%', // Increased to accommodate the button
    justifyContent: 'space-between',
  },
  
  cropName: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 6,
    color: "#2C4C7C",
  },
  
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3,
  },
  
  details: { 
    fontSize: 13, 
    color: "#555555", 
    marginLeft: 4,
  },
  
  farmerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8, // Added margin to separate from button
  },
  
  farmerName: { 
    fontSize: 12, 
    color: "#777777",
    marginLeft: 4,
    fontStyle: "italic",
  },
  
  // Add to Cart Button - new style
  addToCartButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  
  addToCartText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  
  loading: {
    textAlign: "center",
    fontSize: 16,
    color: "#4A6FA5",
    fontWeight: "500",
  },
  
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    width: '100%',
  },
  
  emptyText: {
    marginTop: 12,
    fontSize: 16,
    color: "#4A6FA5",
    fontWeight: "500",
  },
  
  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  
  modalCard: {
    borderRadius: 24,
    padding: 20,
    width: "100%",
    // Web-specific
    ...(Platform.OS === "web" && {
      maxHeight: '90vh',
      maxWidth: '500px',
    }),
    elevation: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
  },
  
  sortModalCard: {
    borderRadius: 20,
    padding: 20,
    width: "80%",
    // Web-specific
    ...(Platform.OS === "web" && {
      maxWidth: '400px',
    }),
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
  },
  
  modalImage: {
    width: "100%",
    height: 220,
    borderRadius: 20,
    marginBottom: 20,
  },
  
  modalTitle: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 12,
    color: "#2C4C7C",
    textAlign: "center",
  },
  
  modalDetailsContainer: {
    marginBottom: 20,
  },
  
  modalDetailRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  
  modalDetails: { 
    fontSize: 16, 
    color: "#444444", 
    marginLeft: 10,
  },
  
  modalButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#4A6FA5",
    padding: 16,
    borderRadius: 14,
    marginVertical: 12,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  
  modalButtonText: {
    color: "#fff",
    fontSize: 16,
    marginLeft: 10,
    fontWeight: "600",
  },
  
  pickerContainer: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#DDE4ED",
    borderRadius: 16,
    overflow: "hidden",
    marginTop: 12,
    marginBottom: 16,
  },
  
  picker: {
    width: "100%",
    height: 55,
    backgroundColor: "#FFFFFF",
    color: "#4A6FA5",
    fontSize: 15,
    fontWeight: "600",
  },
  
  closeButtonContainer: {
    alignSelf: 'center',
    marginTop: 10,
  },
  
  closeButtonGradient: {
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  
  closeText: { 
    fontSize: 16, 
    color: '#FFFFFF', 
    fontWeight: '600' 
  },
  
  // Modal scroll content
  modalScrollContent: {
    flexGrow: 1,
  },
  
  // Bottom Navigation
  bottomNav: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#DDE4ED",
    position: "absolute",
    bottom: 0,
    width: "100%",
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    // Web-specific
    ...(Platform.OS === "web" && {
      flexShrink: 0,
    }),
  },
  
  navItem: { 
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  
  navText: { 
    fontSize: 12, 
    color: "#4A6FA5", 
    marginTop: 2,
    fontWeight: "500",
  },
});