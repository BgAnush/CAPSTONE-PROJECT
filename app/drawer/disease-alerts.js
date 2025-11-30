import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from "expo-constants";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import '../languages/i18n';

/** =========================
 *  API Configuration
 *  ========================= */
const GEMINI_API_KEY =
  Constants.expoConfig?.extra?.EXPO_PUBLIC_GEMINI_API_KEY ||
  Constants.manifest?.extra?.GEMINI_API_KEY;

const DISEASE_PREDICTION_LINK =
  Constants.expoConfig?.extra?.EXPO_PUBLIC_DISEASE_LINK ||
  Constants.manifest?.extra?.DISEASE_LINK;

if (!GEMINI_API_KEY) {
  console.error("❌ GEMINI_API_KEY is missing. Check app.config.js or .env");
}

if (!DISEASE_PREDICTION_LINK) {
  console.error("❌ DISEASE_LINK is missing. Check app.config.js or .env");
}

// Define API_ENDPOINTS with a placeholder that will be updated
const API_ENDPOINTS = {
  DISEASE_PREDICTION: DISEASE_PREDICTION_LINK,
  // This will be updated after checking available models
  GEMINI_API: "",
};

// All available models to try in order of preference
const ALL_MODELS = [
  { name: 'gemini-2.5-flash-lite', api: 'v1beta' }, // Working model first
  { name: 'gemini-2.5-pro', api: 'v1beta' },
  { name: 'gemini-1.5-pro', api: 'v1beta' },
  { name: 'gemini-1.5-flash', api: 'v1beta' },
  { name: 'gemini-pro', api: 'v1beta' },
  { name: 'gemini-pro', api: 'v1' },
];

// Function to check available models and find one that supports generateContent
const checkAvailableModels = async () => {
  // Try each model until we find one that works
  for (const modelOption of ALL_MODELS) {
    try {
      console.log(`Trying model: ${modelOption.name} with API ${modelOption.api}`);
      
      // Test if this model is available
      const testEndpoint = `https://generativelanguage.googleapis.com/${modelOption.api}/models/${modelOption.name}:generateContent?key=${GEMINI_API_KEY}`;
      
      const testResponse = await fetch(testEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "Test" }] }],
          generationConfig: { maxOutputTokens: 1 }
        }),
      });
      
      if (testResponse.ok) {
        console.log(`✅ Model ${modelOption.name} works!`);
        API_ENDPOINTS.GEMINI_API = testEndpoint;
        return {
          success: true,
          modelName: modelOption.name,
          apiVersion: modelOption.api,
          allModels: ALL_MODELS
        };
      } else {
        const errorData = await testResponse.json();
        console.log(`❌ Model ${modelOption.name} failed:`, errorData.error?.message || testResponse.statusText);
      }
    } catch (error) {
      console.warn(`❌ Error testing model ${modelOption.name}:`, error.message);
    }
  }
  
  // If all models fail, use the first one as a fallback
  const fallbackOption = ALL_MODELS[0];
  console.log(`⚠️ All models failed, using fallback: ${fallbackOption.name}`);
  API_ENDPOINTS.GEMINI_API = `https://generativelanguage.googleapis.com/${fallbackOption.api}/models/${fallbackOption.name}:generateContent?key=${GEMINI_API_KEY}`;
  
  return {
    success: false,
    modelName: fallbackOption.name,
    apiVersion: fallbackOption.api,
    allModels: ALL_MODELS
  };
};

// Helper function for API requests with retry logic
const fetchWithRetry = async (url, options, maxRetries = 3, initialDelay = 1000) => {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      
      // If the response is successful, return it
      if (response.ok) {
        return response;
      }
      
      // Handle specific error statuses
      if (response.status === 503) {
        lastError = new Error("Service unavailable (503)");
        console.warn(`Attempt ${attempt}/${maxRetries}: Service unavailable, retrying...`);
      } else if (response.status === 429) {
        lastError = new Error("Too many requests (429)");
        console.warn(`Attempt ${attempt}/${maxRetries}: Rate limited, retrying...`);
      } else if (response.status === 500) {
        lastError = new Error("Internal server error (500)");
        console.warn(`Attempt ${attempt}/${maxRetries}: Internal server error, retrying...`);
      } else {
        // For other errors, don't retry
        const errorData = await response.json();
        throw new Error(`API Error: ${errorData.error?.message || response.statusText}`);
      }
      
      // If this is the last attempt, throw the error
      if (attempt === maxRetries) {
        throw lastError;
      }
      
      // Wait with exponential backoff before retrying
      const delay = initialDelay * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
      
    } catch (error) {
      lastError = error;
      
      // For network errors or overloaded model, retry
      if (error.message.includes("overloaded") || 
          error.message.includes("Service unavailable") ||
          error.message.includes("Too many requests") ||
          error.message.includes("Internal server error") ||
          error.message.includes("Network request failed")) {
        console.warn(`Attempt ${attempt}/${maxRetries}: ${error.message}, retrying...`);
        
        // If this is the last attempt, throw the error
        if (attempt === maxRetries) {
          throw error;
        }
        
        // Wait with exponential backoff before retrying
        const delay = initialDelay * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        // For other errors, don't retry
        throw error;
      }
    }
  }
  
  throw lastError;
};

// Function to try alternative models if the current one fails
const tryAlternativeModel = async (currentModelIndex) => {
  const nextModelIndex = (currentModelIndex + 1) % ALL_MODELS.length;
  const nextModel = ALL_MODELS[nextModelIndex];
  
  console.log(`Trying alternative model: ${nextModel.name} with API ${nextModel.api}`);
  
  const newEndpoint = `https://generativelanguage.googleapis.com/${nextModel.api}/models/${nextModel.name}:generateContent?key=${GEMINI_API_KEY}`;
  API_ENDPOINTS.GEMINI_API = newEndpoint;
  
  return {
    success: true,
    modelName: nextModel.name,
    apiVersion: nextModel.api,
    modelIndex: nextModelIndex
  };
};

/** =========================
 *  Component
 *  ========================= */
export default function DiseasePredict() {
  const { t, i18n } = useTranslation();
  const [imageAsset, setImageAsset] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [predicting, setPredicting] = useState(false);
  const [gettingSuggestions, setGettingSuggestions] = useState(false);
  const [disease, setDisease] = useState("");
  const [confidence, setConfidence] = useState(0);
  const [suggestions, setSuggestions] = useState("");
  const [verificationMessage, setVerificationMessage] = useState("");
  const [error, setError] = useState("");
  const [isHealthy, setIsHealthy] = useState(false);
  const [permissionsGranted, setPermissionsGranted] = useState({
    camera: false,
    mediaLibrary: false,
  });
  const [languageLoaded, setLanguageLoaded] = useState(false);
  const [apiInitialized, setApiInitialized] = useState(false);
  const [modelInfo, setModelInfo] = useState("");
  const [currentModelIndex, setCurrentModelIndex] = useState(0);
  const [retryCount, setRetryCount] = useState(0);

  // Language mapping for Gemini prompts
  const languageMap = {
    en: "English",
    hi: "Hindi",
    kn: "Kannada",
    ta: "Tamil"
  };

  // Initialize API on component mount
  useEffect(() => {
    const initializeApi = async () => {
      const result = await checkAvailableModels();
      if (result.success) {
        setModelInfo(`Using ${result.modelName} (${result.apiVersion})`);
      } else {
        setModelInfo(`Using fallback model: ${result.modelName} (${result.apiVersion})`);
      }
      
      // Find the index of the current model in the ALL_MODELS array
      const currentIndex = ALL_MODELS.findIndex(
        model => model.name === result.modelName && model.api === result.apiVersion
      );
      setCurrentModelIndex(currentIndex >= 0 ? currentIndex : 0);
      
      setApiInitialized(true);
    };
    
    initializeApi();
  }, []);

  // Initialize language from AsyncStorage
  useEffect(() => {
    const initializeLanguage = async () => {
      try {
        const savedLanguage = await AsyncStorage.getItem('userLanguage');
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

  // Request permissions on component mount
  useEffect(() => {
    const requestPermissions = async () => {
      try {
        const cameraStatus = await ImagePicker.requestCameraPermissionsAsync();
        const mediaStatus = await ImagePicker.requestMediaLibraryPermissionsAsync();
        
        setPermissionsGranted({
          camera: cameraStatus.status === 'granted',
          mediaLibrary: mediaStatus.status === 'granted',
        });
        if (cameraStatus.status !== 'granted') {
          console.warn("Camera permission not granted");
        }
        if (mediaStatus.status !== 'granted') {
          console.warn("Media library permission not granted");
        }
      } catch (err) {
        console.error("Permission request error:", err);
        setError(t('diseasePrediction.error.permissionFailed'));
      }
    };
    requestPermissions();
  }, []);

  /** =========================
   *  Image Selection
   *  ========================= */
  const handleImageSelection = async (sourceType) => {
    // Check permissions
    if (sourceType === "camera" && !permissionsGranted.camera) {
      Alert.alert(
        t('diseasePrediction.error.permissionRequired'),
        t('diseasePrediction.error.cameraPermissionRequired'),
        [{ text: t('common.ok') }]
      );
      return;
    }
    
    if (sourceType === "gallery" && !permissionsGranted.mediaLibrary) {
      Alert.alert(
        t('diseasePrediction.error.permissionRequired'),
        t('diseasePrediction.error.galleryPermissionRequired'),
        [{ text: t('common.ok') }]
      );
      return;
    }
    try {
      // Fixed the mediaTypes issue - using the correct property
      const options = {
        mediaTypes: ['images'], // Using array format which is the correct way
        quality: 0.8,
        allowsEditing: true,
        base64: true,
      };
      const result =
        sourceType === "camera"
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);
      if (!result.canceled && result.assets && result.assets.length > 0) {
        resetResults();
        const asset = result.assets[0];
        setImageAsset({
          uri: asset.uri,
          base64: asset.base64,
          type: asset.mimeType || (asset.uri.split('.').pop().toLowerCase() === 'png' ? 'image/png' : 'image/jpeg'),
        });
        setError("");
      }
    } catch (error) {
      console.error("Image selection error:", error);
      setError(t('diseasePrediction.error.imageSelectionFailed'));
      Alert.alert(t('diseasePrediction.error.imageSelectionFailed'), t('diseasePrediction.error.tryAgain'), [{ text: t('common.ok') }]);
    }
  };

  const resetResults = () => {
    setDisease("");
    setConfidence(0);
    setSuggestions("");
    setVerificationMessage("");
    setError("");
    setIsHealthy(false);
    setProcessing(false);
    setVerifying(false);
    setPredicting(false);
    setGettingSuggestions(false);
    setRetryCount(0);
  };

  /** =========================
   *  Verify Leaf + Predict Disease
   *  ========================= */
  const processImageForAnalysis = async () => {
    if (!imageAsset) {
      Alert.alert(t('diseasePrediction.error.noImageSelected'), t('diseasePrediction.error.noImageSelectedMessage'));
      return;
    }
    
    // Check if API is initialized
    if (!apiInitialized) {
      setError("API is still initializing. Please try again in a moment.");
      return;
    }
    
    setProcessing(true);
    setError("");
    setRetryCount(0);
    try {
      // Step 1: Verify if leaf and check if it's healthy
      setVerifying(true);
      const verificationResult = await verifyPlantLeafImage();
      setVerifying(false);
      
      if (!verificationResult.isLeaf) {
        setProcessing(false);
        return;
      }
      
      // If leaf is healthy, don't send to backend
      if (verificationResult.isHealthy) {
        setIsHealthy(true);
        setVerificationMessage(t('diseasePrediction.healthyLeafVerified'));
        setProcessing(false);
        return;
      }
      // Step 2: Send to backend for disease prediction
      setPredicting(true);
      const predictionData = await getDiseasePrediction();
      setPredicting(false);
      
      // Step 3: Get Gemini suggestions
      setGettingSuggestions(true);
      const suggestionData = await getTreatmentSuggestions(predictionData.prediction);
      setGettingSuggestions(false);
      // Update UI
      setDisease(predictionData.prediction);
      setConfidence(predictionData.confidence);
      setSuggestions(suggestionData);
      setProcessing(false);
    } catch (err) {
      console.error("Analysis Error:", err);
      setError(err.message || t('diseasePrediction.error.analysisFailed'));
      setVerificationMessage("");
      setProcessing(false);
      setVerifying(false);
      setPredicting(false);
      setGettingSuggestions(false);
    }
  };

  /** =========================
   *  Helpers
   *  ========================= */
  const verifyPlantLeafImage = async () => {
    try {
      if (!imageAsset || !imageAsset.base64) {
        throw new Error(t('diseasePrediction.error.noImageData'));
      }
      
      const base64Data = imageAsset.base64;
      const currentLanguage = languageMap[i18n.language] || "English";
      
      const prompt = {
        contents: [
          {
            parts: [
              {
                text: `Analyze this image and determine if it contains a plant leaf. 
                Respond in ${currentLanguage}.
                If it does contain a plant leaf, also check if it appears healthy (no spots, discoloration, marks, or signs of disease).
                Respond in one of these formats:
                1. "LEAF_HEALTHY"
                2. "LEAF_UNHEALTHY"
                3. "NOT_LEAF"`,
              },
              {
                inline_data: {
                  mime_type: imageAsset.type,
                  data: base64Data
                }
              }
            ],
          },
        ],
      };
      
      let response;
      let modelTries = 0;
      const maxModelTries = Math.min(3, ALL_MODELS.length); // Try up to 3 different models
      
      // Try with retry logic and model fallback
      while (modelTries < maxModelTries) {
        try {
          response = await fetchWithRetry(API_ENDPOINTS.GEMINI_API, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: prompt.contents,
              generationConfig: { temperature: 0.2, maxOutputTokens: 50 },
            }),
          }, 2, 1000); // Max 2 retries, 1 second initial delay
          
          // If we got a successful response, break out of the loop
          break;
        } catch (error) {
          modelTries++;
          setRetryCount(prev => prev + 1);
          
          // If this is our last try, throw the error
          if (modelTries >= maxModelTries) {
            throw error;
          }
          
          // Try the next model
          console.log(`Current model failed, trying alternative model...`);
          const newModel = await tryAlternativeModel(currentModelIndex);
          setCurrentModelIndex(newModel.modelIndex);
          setModelInfo(`Switched to ${newModel.modelName} (${newModel.apiVersion}) due to server issues`);
        }
      }
      
      const data = await response.json();
      
      if (!data.candidates || !data.candidates[0] || !data.candidates[0].content || 
          !data.candidates[0].content.parts || !data.candidates[0].content.parts[0]) {
        throw new Error(t('diseasePrediction.error.invalidApiResponse'));
      }
      const resultText = data.candidates[0].content.parts[0].text.trim();
      
      // Check if the response starts with "LEAF_HEALTHY", "LEAF_UNHEALTHY", or "NOT_LEAF"
      if (resultText === "LEAF_HEALTHY") {
        return { isLeaf: true, isHealthy: true };
      } else if (resultText === "LEAF_UNHEALTHY") {
        setVerificationMessage(t('diseasePrediction.leafVerifiedWithIssues'));
        return { isLeaf: true, isHealthy: false };
      } else if (resultText === "NOT_LEAF") {
        setVerificationMessage(`${t('diseasePrediction.notValidLeafImage')}`);
        return { isLeaf: false, isHealthy: false };
      } else {
        // Fallback if the response doesn't follow the expected format
        setVerificationMessage(t('diseasePrediction.error.verificationFailed'));
        return { isLeaf: false, isHealthy: false };
      }
    } catch (err) {
      console.error("Verification error:", err);
      
      // Handle specific error messages
      if (err.message.includes("overloaded")) {
        throw new Error("The AI model is currently experiencing high demand. Please try again later.");
      } else if (err.message.includes("Service unavailable") || err.message.includes("503")) {
        throw new Error("The service is temporarily unavailable. Please try again later.");
      } else if (err.message.includes("Internal server error") || err.message.includes("500")) {
        throw new Error("The service encountered an internal error. Please try again later.");
      } else if (err.message.includes("Too many requests") || err.message.includes("429")) {
        throw new Error("Too many requests. Please wait a moment before trying again.");
      }
      
      setVerificationMessage(t('diseasePrediction.error.verificationFailed'));
      throw err; // Re-throw to be caught by the main error handler
    }
  };

  const getDiseasePrediction = async () => {
    try {
      const formData = new FormData();
      
      if (Platform.OS === "web") {
        // For web, convert base64 to blob
        const response = await fetch(`data:${imageAsset.type};base64,${imageAsset.base64}`);
        const blob = await response.blob();
        formData.append("file", blob, `plant-leaf.${imageAsset.type.split('/')[1]}`);
      } else {
        // For native, create an object with the required properties
        formData.append("file", {
          uri: imageAsset.uri,
          name: `plant-leaf.${imageAsset.type.split('/')[1]}`,
          type: imageAsset.type,
        });
      }
      
      const response = await fetch(API_ENDPOINTS.DISEASE_PREDICTION, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`${t('diseasePrediction.error.diseasePredictionFailed')}: ${response.statusText} - ${errorData}`);
      }
      const data = await response.json();
      
      if (!data.prediction || typeof data.confidence !== "number") {
        throw new Error(t('diseasePrediction.error.invalidPredictionData'));
      }
      return {
        prediction: data.prediction,
        confidence: data.confidence.toFixed(2),
      };
    } catch (err) {
      console.error("Disease prediction error:", err);
      throw new Error(t('diseasePrediction.error.diseasePredictionFailed'));
    }
  };

  const getTreatmentSuggestions = async (diseaseName) => {
    try {
      const currentLanguage = languageMap[i18n.language] || "English";
      
      // Get section headers dynamically based on current language
      const prevention = t('diseasePrediction.prevention');
      const treatment = t('diseasePrediction.treatment');
      const medications = t('diseasePrediction.medications');
      const generalCare = t('diseasePrediction.generalCare');
      
      const prompt = {
        contents: [
          {
            parts: [
              {
                text: `As an agricultural expert, provide clear and simple advice for "${diseaseName}" in this format:
 ${prevention}:
List prevention methods as plain text without any markdown formatting
 ${treatment}:
List treatment methods as plain text without any markdown formatting
 ${medications}:
List medications or treatments as plain text without any markdown formatting. This section is compulsory to include.
 ${generalCare}:
List general care advice as plain text without any markdown formatting
Do not use asterisks (*) or any markdown formatting in your response.
Respond in ${currentLanguage}.`,
              },
            ],
          },
        ],
      };
      
      let response;
      let modelTries = 0;
      const maxModelTries = Math.min(3, ALL_MODELS.length); // Try up to 3 different models
      
      // Try with retry logic and model fallback
      while (modelTries < maxModelTries) {
        try {
          response = await fetchWithRetry(API_ENDPOINTS.GEMINI_API, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: prompt.contents,
              generationConfig: { temperature: 0.7, maxOutputTokens: 250 },
            }),
          }, 2, 1000); // Max 2 retries, 1 second initial delay
          
          // If we got a successful response, break out of the loop
          break;
        } catch (error) {
          modelTries++;
          setRetryCount(prev => prev + 1);
          
          // If this is our last try, throw the error
          if (modelTries >= maxModelTries) {
            throw error;
          }
          
          // Try the next model
          console.log(`Current model failed, trying alternative model...`);
          const newModel = await tryAlternativeModel(currentModelIndex);
          setCurrentModelIndex(newModel.modelIndex);
          setModelInfo(`Switched to ${newModel.modelName} (${newModel.apiVersion}) due to server issues`);
        }
      }
      
      const data = await response.json();
      
      if (!data.candidates || !data.candidates[0] || !data.candidates[0].content || 
          !data.candidates[0].content.parts || !data.candidates[0].content.parts[0]) {
        throw new Error(t('diseasePrediction.error.invalidApiResponse'));
      }
      return data.candidates[0].content.parts[0].text || t('diseasePrediction.error.noSuggestionsAvailable');
    } catch (err) {
      console.error("Treatment suggestions error:", err);
      
      // Handle specific error messages
      if (err.message.includes("overloaded")) {
        throw new Error("The AI model is currently experiencing high demand. Please try again later.");
      } else if (err.message.includes("Service unavailable") || err.message.includes("503")) {
        throw new Error("The service is temporarily unavailable. Please try again later.");
      } else if (err.message.includes("Internal server error") || err.message.includes("500")) {
        throw new Error("The service encountered an internal error. Please try again later.");
      } else if (err.message.includes("Too many requests") || err.message.includes("429")) {
        throw new Error("Too many requests. Please wait a moment before trying again.");
      }
      
      return t('diseasePrediction.error.suggestionsFailed');
    }
  };

  // Function to format suggestions text
  const formatSuggestions = (text) => {
    if (!text) return "";
    
    // Remove asterisks and other markdown formatting
    let formattedText = text.replace(/\*/g, '');
    
    // Split into sections
    const sections = formattedText.split('\n\n');
    
    return sections.map((section, index) => {
      if (!section.trim()) return null;
      
      // Check if this is a section header
      const lines = section.split('\n');
      const header = lines[0].trim();
      const content = lines.slice(1).join('\n').trim();
      
      // Render section with bold header and normal content
      return (
        <View key={index} style={styles.suggestionSection}>
          <Text style={styles.suggestionHeader}>{header}</Text>
          <Text style={styles.suggestionContent}>{content}</Text>
        </View>
      );
    });
  };

  // Function to retry with a different model
  const handleRetryWithDifferentModel = async () => {
    try {
      setProcessing(true);
      setError("");
      
      // Try the next model in the list
      const nextModelIndex = (currentModelIndex + 1) % ALL_MODELS.length;
      const nextModel = ALL_MODELS[nextModelIndex];
      
      console.log(`Retrying with model: ${nextModel.name} with API ${nextModel.api}`);
      
      const newEndpoint = `https://generativelanguage.googleapis.com/${nextModel.api}/models/${nextModel.name}:generateContent?key=${GEMINI_API_KEY}`;
      API_ENDPOINTS.GEMINI_API = newEndpoint;
      setCurrentModelIndex(nextModelIndex);
      setModelInfo(`Switched to ${nextModel.name} (${nextModel.api})`);
      
      // Test the new model
      const testResponse = await fetch(newEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "Test" }] }],
          generationConfig: { maxOutputTokens: 1 }
        }),
      });
      
      if (testResponse.ok) {
        setProcessing(false);
        // If the test is successful, allow the user to try again
        Alert.alert(
          "Model Switched",
          `Successfully switched to ${nextModel.name}. Please try analyzing your image again.`,
          [{ text: "OK" }]
        );
      } else {
        throw new Error(`Failed to switch to ${nextModel.name}`);
      }
    } catch (error) {
      console.error("Error switching models:", error);
      setError(`Failed to switch models: ${error.message}`);
      setProcessing(false);
    }
  };

  // Show loading state until language and API are loaded
  if (!languageLoaded || !apiInitialized) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>Initializing app...</Text>
        {modelInfo ? <Text style={styles.modelInfoText}>{modelInfo}</Text> : null}
      </View>
    );
  }

  /** =========================
   *  Render
 *  ========================= */
  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.appTitle}>{t('diseasePrediction.title')}</Text>
        <Text style={styles.subtitle}>
          {t('diseasePrediction.subtitle')}
        </Text>
        {modelInfo ? <Text style={styles.modelInfoText}>{modelInfo}</Text> : null}
      </View>
      
      {/* Error Message */}
      {error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <View style={styles.errorButtonContainer}>
            <TouchableOpacity 
              style={styles.retryButton}
              onPress={() => setError("")}
            >
              <Text style={styles.retryButtonText}>{t('diseasePrediction.retry')}</Text>
            </TouchableOpacity>
            
            {(error.includes("overloaded") || 
              error.includes("Service unavailable") || 
              error.includes("Too many requests") ||
              error.includes("Internal server error")) && (
              <TouchableOpacity 
                style={[styles.retryButton, styles.switchModelButton]}
                onPress={handleRetryWithDifferentModel}
                disabled={processing}
              >
                <Text style={styles.retryButtonText}>Try Different Model</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      ) : null}
      
      {/* Permission Status */}
      {(!permissionsGranted.camera || !permissionsGranted.mediaLibrary) && (
        <View style={styles.warningContainer}>
          <Text style={styles.warningText}>
            {!permissionsGranted.camera ? t('diseasePrediction.warning.cameraPermissionNotGranted') : ""}
            {!permissionsGranted.mediaLibrary ? t('diseasePrediction.warning.galleryPermissionNotGranted') : ""}
          </Text>
        </View>
      )}
      
      {/* Buttons */}
      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.actionButton, styles.cameraButton, !permissionsGranted.camera && styles.disabledButton]}
          onPress={() => handleImageSelection("camera")}
          disabled={processing || !permissionsGranted.camera}
        >
          <Text style={styles.buttonText}>{t('diseasePrediction.capture')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, styles.galleryButton, !permissionsGranted.mediaLibrary && styles.disabledButton]}
          onPress={() => handleImageSelection("gallery")}
          disabled={processing || !permissionsGranted.mediaLibrary}
        >
          <Text style={styles.buttonText}>{t('diseasePrediction.gallery')}</Text>
        </TouchableOpacity>
      </View>
      
      {/* Selected Image */}
      {imageAsset && (
        <View style={styles.imageContainer}>
          <Image source={{ uri: imageAsset.uri }} style={styles.selectedImage} />
          <TouchableOpacity
            style={styles.removeImageButton}
            onPress={() => {
              setImageAsset(null);
              resetResults();
            }}
            disabled={processing}
          >
            <Text style={styles.removeImageText}>{t('diseasePrediction.remove')}</Text>
          </TouchableOpacity>
        </View>
      )}
      
      {/* Verification Message */}
      {verificationMessage ? (
        <Text style={styles.verificationText}>{verificationMessage}</Text>
      ) : null}
      
      {/* Loader */}
      {processing && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3a5a40" />
          <Text style={styles.loadingText}>
            {verifying ? t('diseasePrediction.verifying') : 
             predicting ? t('diseasePrediction.analyzing') : 
             gettingSuggestions ? t('diseasePrediction.gettingSuggestions') : 
             t('diseasePrediction.processing')}
          </Text>
          {retryCount > 0 && (
            <Text style={styles.retryCountText}>Retrying with different model... ({retryCount})</Text>
          )}
        </View>
      )}
      
      {/* Analyze Button */}
      <TouchableOpacity
        style={[styles.analysisButton, (!imageAsset || processing) && styles.disabledButton]}
        onPress={processImageForAnalysis}
        disabled={!imageAsset || processing}
      >
        <Text style={styles.analysisButtonText}>{t('diseasePrediction.analyze')}</Text>
      </TouchableOpacity>
      
      {/* Healthy Leaf Result */}
      {isHealthy ? (
        <View style={styles.resultsCard}>
          <Text style={styles.resultTitle}>{t('diseasePrediction.diagnosis')}</Text>
          <Text style={styles.diseaseName}>{t('diseasePrediction.healthyLeaf')}</Text>
          <Text style={styles.sectionContent}>{t('diseasePrediction.healthyLeafDescription')}</Text>
        </View>
      ) : null}
      
      {/* Disease Results */}
      {disease && !isHealthy ? (
        <View style={styles.resultsCard}>
          <Text style={styles.resultTitle}>{t('diseasePrediction.diagnosis')}</Text>
          <Text style={styles.diseaseName}>{disease}</Text>
          <Text style={styles.confidenceText}>{t('diseasePrediction.confidence')} {confidence}%</Text>
          
          {/* Treatment Suggestions */}
          <View style={styles.suggestionsContainer}>
            <Text style={styles.suggestionsTitle}>{t('diseasePrediction.treatmentSuggestions')}</Text>
            {formatSuggestions(suggestions)}
            
            {/* Professional Warning Note */}
            <View style={styles.disclaimerContainer}>
              <Text style={styles.disclaimerTitle}>{t('diseasePrediction.professionalAdvisory')}</Text>
              <Text style={styles.disclaimerText}>
                {t('diseasePrediction.professionalAdvisoryText')}
              </Text>
            </View>
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

/** =========================
 *  Styles
 *  ========================= */
const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: "#f5f5f0" 
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f0',
  },
  header: {
    padding: 24,
    alignItems: "center",
    backgroundColor: "#3a5a40",
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    marginBottom: 20,
    elevation: 4,
  },
  appTitle: { 
    fontSize: 24, 
    fontWeight: "bold", 
    color: "#fff",
    letterSpacing: 0.5,
  },
  subtitle: { 
    fontSize: 14, 
    color: "#e6e6dc", 
    textAlign: "center",
    marginTop: 4,
  },
  modelInfoText: {
    fontSize: 12,
    color: "#e6e6dc",
    marginTop: 4,
    fontStyle: 'italic',
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  actionButton: {
    flex: 0.48,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
    elevation: 2,
  },
  cameraButton: { 
    backgroundColor: "#588157" 
  },
  galleryButton: { 
    backgroundColor: "#a3b18a" 
  },
  buttonText: { 
    color: "#fff", 
    fontWeight: "600",
    fontSize: 16,
  },
  imageContainer: { 
    margin: 20, 
    position: "relative",
    elevation: 3,
  },
  selectedImage: {
    width: "100%",
    height: 300,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#dad7cd",
  },
  removeImageButton: {
    position: "absolute",
    top: 10,
    right: 10,
    backgroundColor: "#fff",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#3a5a40",
  },
  removeImageText: { 
    color: "#3a5a40",
    fontWeight: "500",
  },
  verificationText: {
    textAlign: "center",
    marginVertical: 10,
    fontWeight: "500",
    color: "#606c38",
    fontSize: 14,
  },
  analysisButton: {
    margin: 20,
    padding: 16,
    backgroundColor: "#3a5a40",
    borderRadius: 8,
    alignItems: "center",
    elevation: 3,
  },
  disabledButton: { 
    backgroundColor: "#a3b18a" 
  },
  analysisButtonText: { 
    color: "#fff", 
    fontWeight: "bold",
    fontSize: 16,
  },
  resultsCard: {
    margin: 20,
    padding: 16,
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#dad7cd",
    elevation: 2,
  },
  resultTitle: { 
    fontSize: 18, 
    fontWeight: "bold", 
    color: "#3a5a40",
    borderBottomWidth: 1,
    borderBottomColor: "#dad7cd",
    paddingBottom: 8,
    marginBottom: 12,
  },
  diseaseName: { 
    fontSize: 20, 
    fontWeight: "bold", 
    marginVertical: 6,
    color: "#344e41",
  },
  confidenceText: { 
    fontSize: 14, 
    color: "#606c38", 
    marginBottom: 10,
    fontStyle: "italic",
  },
  sectionContent: { 
    fontSize: 14, 
    color: "#333", 
    marginBottom: 8,
    lineHeight: 20,
  },
  suggestionsContainer: {
    marginTop: 15,
  },
  suggestionsTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 10,
    color: "#3a5a40",
  },
  suggestionSection: {
    marginBottom: 15,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0e8",
  },
  suggestionHeader: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#344e41",
    marginBottom: 5,
  },
  suggestionContent: {
    fontSize: 14,
    color: "#333",
    lineHeight: 20,
  },
  disclaimerContainer: {
    marginTop: 20,
    padding: 15,
    backgroundColor: "#fefae0",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#dda15e",
  },
  disclaimerTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#bc6c25",
    marginBottom: 8,
  },
  disclaimerText: {
    fontSize: 14,
    color: "#606c38",
    lineHeight: 20,
    fontStyle: "italic",
  },
  errorContainer: {
    margin: 20,
    padding: 15,
    backgroundColor: "#f8d7da",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#f5c6cb",
  },
  errorText: {
    color: "#721c24",
    flex: 1,
    marginBottom: 10,
  },
  errorButtonContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  retryButton: {
    backgroundColor: "#721c24",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 4,
    flex: 1,
    marginHorizontal: 5,
  },
  switchModelButton: {
    backgroundColor: "#6c757d",
  },
  retryButtonText: {
    color: "#fff",
    fontWeight: "500",
    textAlign: "center",
  },
  warningContainer: {
    margin: 20,
    padding: 10,
    backgroundColor: "#fff3cd",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ffeaa7",
  },
  warningText: {
    color: "#856404",
    textAlign: "center",
  },
  loadingText: {
    marginTop: 10,
    color: "#606c38",
    fontSize: 14,
  },
  retryCountText: {
    marginTop: 5,
    color: "#f44336",
    fontSize: 12,
    fontStyle: 'italic',
  }
});