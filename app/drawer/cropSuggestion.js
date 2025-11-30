import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import i18n from "../languages/i18n"; // Import your i18n configuration

const { width } = Dimensions.get("window");
const CARD_WIDTH = width * 0.9;

const EXPO_PUBLIC_CROP_RECOMMENDATION_LINK =
  Constants.expoConfig?.extra?.EXPO_PUBIC_CROP_SUGGESTIONS_LIN ||
  Constants.manifest?.extra?.EXPO_PUBLIC_CROP_RECOMMENDATION_LINK;

const API_ENDPOINT = `${EXPO_PUBLIC_CROP_RECOMMENDATION_LINK}/predict`;

const CropSuggestions = () => {
  const { t } = useTranslation();
  const [N, setN] = useState("");
  const [P, setP] = useState("");
  const [K, setK] = useState("");
  const [ph, setPh] = useState("");
  const [loading, setLoading] = useState(false);
  const [weatherData, setWeatherData] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [languageLoaded, setLanguageLoaded] = useState(false);

  // Initialize language from AsyncStorage
  useEffect(() => {
    const initializeLanguage = async () => {
      try {
        // Check if there's a saved language preference
        const savedLanguage = await AsyncStorage.getItem('selectedLanguage');
        if (savedLanguage) {
          i18n.changeLanguage(savedLanguage);
        }
      } catch (error) {
        console.error('Error loading language preference:', error);
      } finally {
        setLanguageLoaded(true);
      }
    };
    
    initializeLanguage();
  }, []);

  const fetchWeatherData = async () => {
    try {
      const weatherString = await AsyncStorage.getItem("dashboard_weather");
      if (weatherString) {
        setWeatherData(JSON.parse(weatherString));
      }
    } catch (err) {
      console.error("Error fetching weather data:", err);
    }
  };

  useEffect(() => {
    fetchWeatherData();
  }, []);

  const handleSubmit = async () => {
    setLoading(true);
    setRecommendations([]);
    try {
      const inputData = {
        N: parseFloat(N) || 0,
        P: parseFloat(P) || 0,
        K: parseFloat(K) || 0,
        temperature: weatherData?.main?.temp || 0,
        humidity: weatherData?.main?.humidity || 0,
        ph: parseFloat(ph) || 0,
        rainfall: weatherData?.rain ? weatherData.rain["1h"] || 0 : 0,
      };

      console.log("Sending request to:", API_ENDPOINT);
      console.log("Request data:", inputData);

      const response = await fetch(API_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(inputData),
      });

      const data = await response.json();
      console.log("API Response:", data);

      if (data.recommendations && Array.isArray(data.recommendations)) {
        setRecommendations(data.recommendations);
      } else if (data.crop) {
        Alert.alert(t("cropRecommendations"), `${t("suggestedCrop")}: ${data.crop}`);
      } else {
        Alert.alert(t("noRecommendationsFound"));
      }
    } catch (err) {
      console.error("Error:", err);
      Alert.alert(t("error"), t("somethingWentWrong"));
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
    <ScrollView style={styles.container}>
      <LinearGradient
        colors={["#1a2a6c", "#b21f1f", "#1a2a6c"]}
        style={styles.headerGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.header}>
          <Ionicons name="leaf-outline" size={42} color="#fff" />
          <Text style={styles.heading}>{t("cropRecommendations")}</Text>
          <Text style={styles.subheading}>{t("basedOnSoilWeather")}</Text>
        </View>
      </LinearGradient>

      <View style={styles.inputContainer}>
        {[
          { icon: "water-outline", color: "#3498db", placeholder: t("nitrogen"), value: N, setter: setN },
          { icon: "leaf-outline", color: "#2ecc71", placeholder: t("phosphorus"), value: P, setter: setP },
          { icon: "flower-outline", color: "#e67e22", placeholder: t("potassium"), value: K, setter: setK },
          { icon: "flask-outline", color: "#9b59b6", placeholder: t("phLevel"), value: ph, setter: setPh },
        ].map((field, index) => (
          <View key={index} style={styles.inputGroup}>
            <Ionicons name={field.icon} size={24} color={field.color} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder={field.placeholder}
              keyboardType="numeric"
              value={field.value}
              onChangeText={field.setter}
              placeholderTextColor="#95a5a6"
            />
          </View>
        ))}

        <View style={styles.weatherCard}>
          <View style={styles.weatherHeader}>
            <Ionicons name="cloud-outline" size={24} color="#3498db" />
            <Text style={styles.weatherTitle}>{t("weatherData")}</Text>
          </View>
          {weatherData ? (
            <View style={styles.weatherDataContainer}>
              <View style={styles.weatherItem}>
                <Ionicons name="thermometer-outline" size={20} color="#e74c3c" />
                <Text style={styles.weatherText}>{weatherData.main.temp.toFixed(1)}°C</Text>
              </View>
              <View style={styles.weatherItem}>
                <Ionicons name="water-outline" size={20} color="#3498db" />
                <Text style={styles.weatherText}>{weatherData.main.humidity}%</Text>
              </View>
              <View style={styles.weatherItem}>
                <Ionicons name="rainy-outline" size={20} color="#3498db" />
                <Text style={styles.weatherText}>
                  {weatherData.rain ? weatherData.rain["1h"] || 0 : 0} mm
                </Text>
              </View>
            </View>
          ) : (
            <Text style={styles.noWeatherData}>{t("noWeatherData")}</Text>
          )}
        </View>

        <TouchableOpacity
          style={[styles.submitButton, loading && styles.disabledButton]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="leaf" size={20} color="#fff" />
              <Text style={styles.buttonText}>{t("getRecommendations")}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {recommendations.length > 0 && (
        <View style={styles.recommendationContainer}>
          <Text style={styles.recommendationTitle}>{t("recommendedCrops")}</Text>
          {recommendations.map((item, idx) => {
            const confidence = parseFloat(item.confidence).toFixed(2);
            return (
              <View key={idx} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Ionicons name="leaf" size={28} color="#2ecc71" />
                  <View style={styles.cardTitleContainer}>
                    <Text style={styles.cropName}>{item.crop}</Text>
                    <Text style={styles.confidence}>{confidence}% {t("match")}</Text>
                  </View>
                </View>
                <View style={styles.progressBarContainer}>
                  <View style={[styles.progressBar, { width: `${confidence}%` }]} />
                </View>
                <View style={styles.cardFooter}>
                  <View style={styles.confidenceLabel}>
                    <Text style={styles.confidenceText}>{t("confidence")}</Text>
                  </View>
                  <View style={styles.confidenceValue}>
                    <Text style={styles.confidenceText}>{confidence}%</Text>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8f9fa",
    paddingTop: Platform.OS === "android" ? 20 : 0,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  headerGradient: {
    paddingTop: 40,
    paddingBottom: 30,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
  },
  header: {
    alignItems: "center",
    paddingHorizontal: 20,
  },
  heading: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#fff",
    marginTop: 15,
    textShadowColor: "rgba(0, 0, 0, 0.3)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  subheading: {
    fontSize: 16,
    color: "#ecf0f1",
    marginTop: 5,
    textAlign: "center",
    opacity: 0.9,
  },
  inputContainer: {
    paddingHorizontal: 20,
    marginTop: -20,
    zIndex: 10,
  },
  inputGroup: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 16,
    marginBottom: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  inputIcon: {
    marginRight: 15,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: "#2c3e50",
  },
  weatherCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  weatherHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 15,
  },
  weatherTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#2c3e50",
    marginLeft: 10,
  },
  weatherDataContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  weatherItem: {
    alignItems: "center",
    flex: 1,
  },
  weatherText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#34495e",
    marginTop: 5,
  },
  noWeatherData: {
    fontSize: 16,
    color: "#95a5a6",
    fontStyle: "italic",
    textAlign: "center",
    paddingVertical: 10,
  },
  submitButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
    borderRadius: 16,
    backgroundColor: "#2ecc71",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 4,
    marginTop: 10,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
    marginLeft: 8,
  },
  disabledButton: {
    backgroundColor: "#95a5a6",
  },
  recommendationContainer: {
    padding: 20,
    marginTop: 10,
  },
  recommendationTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#2c3e50",
    marginBottom: 20,
    textAlign: "center",
  },
  card: {
    width: CARD_WIDTH,
    alignSelf: "center",
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 15,
  },
  cardTitleContainer: {
    marginLeft: 15,
  },
  cropName: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#2c3e50",
    textTransform: "capitalize",
  },
  confidence: {
    fontSize: 14,
    color: "#7f8c8d",
    marginTop: 2,
  },
  progressBarContainer: {
    height: 10,
    backgroundColor: "#ecf0f1",
    borderRadius: 5,
    overflow: "hidden",
    marginBottom: 15,
  },
  progressBar: {
    height: "100%",
    backgroundColor: "#2ecc71",
    borderRadius: 5,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  confidenceLabel: {
    backgroundColor: "#ecf0f1",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  confidenceValue: {
    backgroundColor: "#2ecc71",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  confidenceText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#2c3e50",
  },
});

export default CropSuggestions;