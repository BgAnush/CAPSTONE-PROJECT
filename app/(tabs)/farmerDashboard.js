// Import necessary components and libraries
import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import Constants from "expo-constants";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import Animated from 'react-native-reanimated';
import '../languages/i18n';
import i18n from '../languages/i18n'; // Import the i18n instance
import { supabase } from "../supabase/supabaseClient";

// Conditionally import StatusBar only for native platforms
let StatusBar;
if (Platform.OS !== 'web') {
  StatusBar = require('react-native').StatusBar;
}

// Create a platform-specific ScrollView component
const MyScroll = Platform.OS === 'web' ? ScrollView : Animated.ScrollView;

/***********************************
 * Constants
 ***********************************/
// OpenWeather API key (should be moved to environment variables in production)
const OPEN_WEATHER_API_KEY =  Constants.expoConfig?.extra?.EXPO_PUBLIC_OPEN_WEATHER_API_KEY ||
  Constants.manifest?.extra?.EXPO_PUBLIC_OPEN_WEATHER_API_KEY; 
// Placeholder image URL for when no image is available
const PLACEHOLDER = "https://via.placeholder.com/600x400.png?text=No+Image";
// Screen width for responsive calculations
const SCREEN_WIDTH = Dimensions.get("window").width;
// Card width for grid layout (two columns with padding)
const CARD_WIDTH = (SCREEN_WIDTH - 48) / 2; 
// Cache keys for AsyncStorage
const CACHE_KEYS = {
  PRODUCE: "dashboard_produce",
  FARMER_NAME: "dashboard_farmer_name",
  WEATHER: "dashboard_weather",
  USER_LANGUAGE: "userLanguage", // Added language cache key
};

/***********************************
 * Helper Functions
 ***********************************/
/**
 * Safely parse JSON string with fallback
 * @param {string} str - JSON string to parse
 * @param {any} fallback - Fallback value if parsing fails
 * @returns {any} Parsed object or fallback
 */
const safeParseJSON = (str, fallback = null) => {
  try {
    return JSON.parse(str);
  } catch (e) {
    return fallback;
  }
};

/**
 * Format number as currency in Indian Rupees
 * @param {number} n - Number to format
 * @returns {string} Formatted currency string
 */
const fmtCurrency = (n) => `₹${Number(n || 0).toFixed(2)}`;

/**
 * Get weather emoji based on weather condition
 * @param {string} weatherMain - Main weather condition
 * @returns {string} Weather emoji
 */
const getWeatherEmoji = (weatherMain) => {
  const weatherMap = {
    Clear: "☀️",
    Clouds: "☁️",
    Rain: "🌧️",
    Drizzle: "🌧️",
    Thunderstorm: "⛈️",
    Snow: "❄️",
    Mist: "🌫️",
    Fog: "🌫️",
    Haze: "🌫️",
  };
  return weatherMap[weatherMain] || "🌡️";
};

/***********************************
 * Main Component: FarmerDashboard
 ***********************************/
export default function FarmerDashboard() {
  const { t } = useTranslation();
  const router = useRouter();
  const [userId, setUserId] = useState(null);
  const [languageLoaded, setLanguageLoaded] = useState(false); // Track if language is loaded
  
  // UI & Data state
  const [farmerName, setFarmerName] = useState("");
  const [produce, setProduce] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  
  // Weather state
  const [weather, setWeather] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [weatherError, setWeatherError] = useState("");
  
  // Edit/Add modals state
  const [editVisible, setEditVisible] = useState(false);
  const [addVisible, setAddVisible] = useState(false);
  const [editingCrop, setEditingCrop] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [addingProduce, setAddingProduce] = useState(false);
  
  // Form fields for edit / add
  const [form, setForm] = useState({ 
    crop_name: "", 
    price_per_kg: "", 
    quantity: "", 
    status: "in_stock", 
    image_uri: "" 
  });
  
  // Messages state
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  
  // Notifications state
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);
  
  // Search / filter / sort state
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStock, setFilterStock] = useState("all"); // all | in_stock | out_of_stock
  const [sortBy, setSortBy] = useState("newest"); // newest | price_asc | price_desc | qty_desc
  
  // Dropdown visibility states
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  
  // Refs
  const supabaseChannelsRef = useRef([]);
  
  // Custom alert state
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertConfig, setAlertConfig] = useState({ 
    title: "", 
    message: "", 
    buttons: [] 
  });

  /***********************************
   * Effects
   ***********************************/
  /**
   * Initialize component and set up user data and language
   */
  useEffect(() => {
    const initialize = async () => {
      try {
        // Set language from AsyncStorage
        const storedLanguage = await AsyncStorage.getItem(CACHE_KEYS.USER_LANGUAGE);
        if (storedLanguage) {
          i18n.changeLanguage(storedLanguage);
        }
        setLanguageLoaded(true);
        
        // Get user ID
        const id = await AsyncStorage.getItem("userId");
        if (id) {
          setUserId(id);
          setupRealtimeSubscriptions(id);
        }
      } catch (err) {
        console.warn("Error initializing dashboard:", err);
        setErrorMsg(t('dashboard.errorLoadUserData'));
        setLanguageLoaded(true); // Ensure we continue even if language fails
      }
    };
    
    initialize();
    
    return () => {
      removeAllSupabaseChannels();
    };
  }, [t]);
  
  /**
   * Fetch data when userId is available and language is loaded
   */
  useEffect(() => {
    if (userId && languageLoaded) {
      fetchAll();
    }
  }, [userId, languageLoaded]);

  /***********************************
   * Supabase Realtime Helpers
   ***********************************/
  /**
   * Set up realtime subscriptions for messages and notifications
   * @param {string} uid - User ID
   */
  const setupRealtimeSubscriptions = (uid) => {
    if (!uid) return;
    
    try {
      // Messages channel
      const messagesChannel = supabase
        .channel("messages")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages" },
          async (payload) => {
            try {
              const { data: conv } = await supabase
                .from("conversations")
                .select("farmer_id,retailer_id")
                .eq("id", payload.new.conversation_id)
                .single();
                
              if (conv && (conv.farmer_id === uid || conv.retailer_id === uid) && payload.new.sender_id !== uid) {
                const cnt = await fetchUnreadMessagesCount(uid);
                setUnreadMessagesCount(cnt);
              }
            } catch (e) {
              console.warn("Realtime message handling error:", e);
            }
          }
        )
        .subscribe();
        
      // Notifications channel
      const notificationsChannel = supabase
        .channel("notifications")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications" },
          async (payload) => {
            try {
              if (payload.new.user_id === uid && !payload.new.read) {
                const cnt = await fetchUnreadNotificationsCount(uid);
                setUnreadNotificationsCount(cnt);
              }
            } catch (e) {
              console.warn("Realtime notification handling error:", e);
            }
          }
        )
        .subscribe();
        
      supabaseChannelsRef.current.push(messagesChannel, notificationsChannel);
    } catch (e) {
      console.warn("setupRealtimeSubscriptions error:", e);
    }
  };
  
  /**
   * Remove all Supabase channels
   */
  const removeAllSupabaseChannels = () => {
    try {
      supabaseChannelsRef.current.forEach((ch) => {
        try {
          ch.unsubscribe();
        } catch (e) {
          console.warn("Error unsubscribing channel:", e);
        }
      });
      supabase.removeAllChannels();
      supabaseChannelsRef.current = [];
    } catch (e) {
      console.warn("Error removing channels:", e);
    }
  };

  /***********************************
   * Data Fetching Helpers
   ***********************************/
  /**
   * Fetch unread messages count for user
   * @param {string} uid - User ID
   * @returns {number} Count of unread messages
   */
  const fetchUnreadMessagesCount = async (uid) => {
    try {
      const { data: conversations, error: convError } = await supabase
        .from("conversations")
        .select("id")
        .or(`farmer_id.eq.${uid},retailer_id.eq.${uid}`);
        
      if (convError) throw convError;
      if (!conversations || conversations.length === 0) return 0;
      
      const conversationIds = conversations.map((c) => c.id);
      const { count, error } = await supabase
        .from("messages")
        .select("*", { count: "exact", head: true })
        .in("conversation_id", conversationIds)
        .is("read_at", null)
        .neq("sender_id", uid);
        
      if (error) throw error;
      return count || 0;
    } catch (err) {
      console.error("Error fetching unread messages:", err);
      return 0;
    }
  };
  
  /**
   * Fetch unread notifications count for user
   * @param {string} uid - User ID
   * @returns {number} Count of unread notifications
   */
  const fetchUnreadNotificationsCount = async (uid) => {
    try {
      const { count, error } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", uid)
        .eq("read", false);
        
      if (error) throw error;
      return count || 0;
    } catch (err) {
      console.error("Error fetching unread notifications:", err);
      return 0;
    }
  };
  
  /**
   * Fetch weather data based on device location
   */
  const fetchWeather = async () => {
    setWeatherLoading(true);
    setWeatherError("");
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        const cached = await AsyncStorage.getItem(CACHE_KEYS.WEATHER);
        setWeather(cached ? JSON.parse(cached) : null);
        setWeatherError(t('dashboard.locationPermissionDenied'));
        return;
      }
      
      const loc = await Location.getCurrentPositionAsync({ 
        accuracy: Location.Accuracy.Low 
      });
      const { latitude, longitude } = loc.coords || {};
      
      if (typeof latitude !== "number" || typeof longitude !== "number") {
        throw new Error("Invalid coordinates");
      }
      
      const res = await axios.get("https://api.openweathermap.org/data/2.5/weather", {
        params: { 
          lat: latitude, 
          lon: longitude, 
          appid: OPEN_WEATHER_API_KEY, 
          units: "metric" 
        },
        timeout: 8000,
      });
      
      if (res?.data) {
        setWeather(res.data);
        await AsyncStorage.setItem(CACHE_KEYS.WEATHER, JSON.stringify(res.data));
      }
    } catch (err) {
      console.warn("fetchWeather error:", err);
      const cached = await AsyncStorage.getItem(CACHE_KEYS.WEATHER);
      setWeather(cached ? JSON.parse(cached) : null);
      setWeatherError(t('dashboard.weatherLoadError'));
    } finally {
      setWeatherLoading(false);
    }
  };
  
  /**
   * Fetch all dashboard data (profile, produce, counts)
   */
  const fetchData = async () => {
    if (!userId) return;
    
    setErrorMsg("");
    setLoading(true);
    try {
      // Fetch farmer profile
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("name")
        .eq("id", userId)
        .single();
        
      if (profileError) throw profileError;
      
      // Fetch produce data
      const { data: produceData, error: produceError } = await supabase
        .from("produce")
        .select("*")
        .eq("farmer_id", userId)
        .order("created_at", { ascending: false });
        
      if (produceError) throw produceError;
      
      // Fetch unread counts
      const unreadMsgCnt = await fetchUnreadMessagesCount(userId);
      const unreadNotifCnt = await fetchUnreadNotificationsCount(userId);
      
      // Update state
      setFarmerName(profileData?.name || "");
      setProduce(produceData || []);
      setUnreadMessagesCount(unreadMsgCnt);
      setUnreadNotificationsCount(unreadNotifCnt);
      
      // Cache data
      await AsyncStorage.multiSet([
        [CACHE_KEYS.FARMER_NAME, profileData?.name || ""],
        [CACHE_KEYS.PRODUCE, JSON.stringify(produceData || [])],
      ]);
    } catch (err) {
      console.error("fetchData error:", err);
      setErrorMsg(err.message || t('dashboard.loadDataError'));
      
      // Fallback to cache
      try {
        const cached = await AsyncStorage.multiGet([
          CACHE_KEYS.FARMER_NAME, 
          CACHE_KEYS.PRODUCE
        ]);
        const farmerNameCached = cached[0]?.[1];
        const produceCached = safeParseJSON(cached[1]?.[1], []);
        
        setFarmerName(farmerNameCached || "");
        setProduce(produceCached || []);
      } catch (e) {
        console.warn("cache fallback error:", e);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };
  
  /**
   * Fetch all data including weather
   */
  const fetchAll = async () => {
    await Promise.all([fetchWeather(), fetchData()]);
  };

  /***********************************
   * CRUD Operations
   ***********************************/
  /**
   * Handle crop deletion
   * @param {string} cropId - ID of crop to delete
   */
  const handleDelete = (cropId) => {
    showCustomAlert(
      t('dashboard.deleteCrop'), 
      t('dashboard.deleteCropConfirmation'), 
      [
        { text: t('common.cancel'), style: "cancel" },
        {
          text: t('common.delete'),
          style: "destructive",
          onPress: async () => {
            try {
              const { error } = await supabase
                .from("produce")
                .delete()
                .eq("id", cropId)
                .eq("farmer_id", userId);
                
              if (error) throw error;
              
              setProduce((prev) => prev.filter((p) => p.id !== cropId));
              showCustomAlert(t('common.success'), t('dashboard.cropRemovedSuccess'));
            } catch (err) {
              console.error("Delete failed:", err);
              showCustomAlert(t('common.error'), t('dashboard.cropDeleteError'));
            }
          },
        },
        { text: t('common.ok'), style: "cancel" }
      ]
    );
  };
  
  /**
   * Open edit modal with crop data
   * @param {object} item - Crop data to edit
   */
  const openEditModal = (item) => {
    setEditingCrop(item);
    setForm({
      crop_name: item.crop_name || "",
      price_per_kg: String(item.price_per_kg || ""),
      quantity: String(item.quantity || ""),
      status: item.status === "out_of_stock" ? "out_of_stock" : "in_stock",
      image_uri: item.image_url || "",
    });
    setEditVisible(true);
  };
  
  /**
   * Save updated crop data
   */
  const handleSaveUpdate = async () => {
    if (!editingCrop) return;
    
    // Validate form data
    const parsedQty = parseInt(form.quantity || "0", 10);
    const parsedPrice = parseFloat(form.price_per_kg || "0");
    
    if (isNaN(parsedQty) || parsedQty < 0) {
      return showCustomAlert(t('common.invalid'), t('dashboard.quantityPositiveError'), [
        { text: t('common.ok') }
      ]);
    }
    
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      return showCustomAlert(t('common.invalid'), t('dashboard.pricePositiveError'), [
        { text: t('common.ok') }
      ]);
    }
    
    const finalStatus = parsedQty > 0 ? "in_stock" : "out_of_stock";
    const updatedFields = { 
      quantity: parsedQty, 
      price_per_kg: parsedPrice, 
      status: finalStatus, 
      crop_name: form.crop_name 
    };
    
    try {
      setSavingEdit(true);
      const { data, error } = await supabase
        .from("produce")
        .update(updatedFields)
        .eq("id", editingCrop.id)
        .eq("farmer_id", userId)
        .select();
        
      if (error) throw error;
      
      const updated = data?.[0] || { ...editingCrop, ...updatedFields };
      setProduce((prev) => prev.map((p) => (p.id === editingCrop.id ? updated : p)));
      setEditVisible(false);
      setEditingCrop(null);
      showCustomAlert(t('common.success'), t('dashboard.cropUpdateSuccess'), [
        { text: t('common.ok'), style: "cancel" }
      ]);
    } catch (err) {
      console.error("Save update failed:", err);
      showCustomAlert(t('common.error'), t('dashboard.saveUpdateError'), [
        { text: t('common.ok') }
      ]);
    } finally {
      setSavingEdit(false);
    }
  };
  
  /**
   * Pick image from device library
   */
  const pickImage = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        return showCustomAlert(
          t('dashboard.permissionDenied'), 
          t('dashboard.imageAccessPermission'),
          [{ text: t('common.ok') }]
        );
      }
      
      const res = await ImagePicker.launchImageLibraryAsync({ 
        mediaTypes: ImagePicker.MediaTypeOptions.Images, 
        quality: 0.7 
      });
      
      if (!res.canceled) {
        setForm((f) => ({ ...f, image_uri: res.assets[0].uri }));
      }
    } catch (err) {
      console.error("Image pick error:", err);
      showCustomAlert(t('common.error'), t('dashboard.imagePickError'), [
        { text: t('common.ok') }
      ]);
    }
  };
  
  /**
   * Upload image to Supabase storage
   * @param {string} uri - Image URI
   * @param {string} filenamePrefix - Prefix for filename
   * @returns {string|null} Public URL of uploaded image or null
   */
  const uploadImageToSupabase = async (uri, filenamePrefix = "produce_") => {
    try {
      if (!uri) return null;
      
      const response = await fetch(uri);
      const blob = await response.blob();
      const ext = uri.split(".").pop();
      const fileName = `${filenamePrefix}${Date.now()}.${ext}`;
      
      const { data, error } = await supabase.storage
        .from("produce-images")
        .upload(fileName, blob, { 
          cacheControl: "3600", 
          upsert: false 
        });
        
      if (error) throw error;
      
      const { publicURL } = supabase.storage
        .from("produce-images")
        .getPublicUrl(data.path);
        
      return publicURL;
    } catch (err) {
      console.error("uploadImageToSupabase error:", err);
      return null;
    }
  };
  
  /**
   * Add new produce to database
   */
  const handleAddProduce = async () => {
    // Validate form data
    if (!form.crop_name?.trim()) {
      return showCustomAlert(t('common.invalid'), t('dashboard.cropNameRequired'), [
        { text: t('common.ok') }
      ]);
    }
    
    const parsedQty = parseInt(form.quantity || "0", 10);
    const parsedPrice = parseFloat(form.price_per_kg || "0");
    
    if (isNaN(parsedQty) || parsedQty < 0) {
      return showCustomAlert(t('common.invalid'), t('dashboard.quantityPositiveError'), [
        { text: t('common.ok') }
      ]);
    }
    
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      return showCustomAlert(t('common.invalid'), t('dashboard.pricePositiveError'), [
        { text: t('common.ok') }
      ]);
    }
    
    try {
      setAddingProduce(true);
      
      // Upload image if provided
      let imageUrl = form.image_uri || null;
      if (form.image_uri && form.image_uri.startsWith("file")) {
        const uploaded = await uploadImageToSupabase(form.image_uri);
        if (uploaded) {
          imageUrl = uploaded;
        } else {
          showCustomAlert(t('common.warning'), t('dashboard.imageUploadFailed'), [
            { text: t('common.ok') }
          ]);
        }
      }
      
      const insertPayload = {
        farmer_id: userId,
        crop_name: form.crop_name,
        price_per_kg: parsedPrice,
        quantity: parsedQty,
        status: parsedQty > 0 ? "in_stock" : "out_of_stock",
        image_url: imageUrl,
      };
      
      const { data, error } = await supabase
        .from("produce")
        .insert([insertPayload])
        .select();
        
      if (error) throw error;
      
      const created = data?.[0];
      setProduce((prev) => [created, ...prev]);
      setAddVisible(false);
      setForm({ 
        crop_name: "", 
        price_per_kg: "", 
        quantity: "", 
        status: "in_stock", 
        image_uri: "" 
      });
      showCustomAlert(t('common.success'), t('dashboard.produceAddedSuccess'), [
        { text: t('common.ok') }
      ]);
    } catch (err) {
      console.error("add produce error:", err);
      showCustomAlert(t('common.error'), t('dashboard.addProduceError'), [
        { text: t('common.ok') }
      ]);
    } finally {
      setAddingProduce(false);
    }
  };

  /***********************************
   * Navigation Handlers
   ***********************************/
  /**
   * Safely navigate to a route
   * @param {string} routeName - Route to navigate to
   * @param {object} params - Navigation parameters
   */
  const safeNavigate = useCallback(
    (routeName, params = {}) => {
      try {
        if (router && router.push) {
          router.push(routeName);
        } else {
          console.warn("Router not available, fallback to console");
        }
      } catch (err) {
        console.error(`Navigation error to ${routeName}:`, err);
        showCustomAlert(
          t('dashboard.navigationError'), 
          t('dashboard.pageUnavailable', { page: routeName }),
          [{ text: t('common.ok') }]
        );
      }
    },
    [router, t],
  );
  
  /**
   * Handle messages button press
   */
  const handleMessagesPress = async () => {
    try {
      const { data: conversations, error } = await supabase
        .from("conversations")
        .select("*")
        .eq("farmer_id", userId)
        .order("last_message_at", { ascending: false });
        
      if (error) throw error;
      
      if (conversations && conversations.length > 0) {
        safeNavigate("/drawer/ConversationalList");
      } else {
        showCustomAlert(
          t('dashboard.messages'), 
          t('dashboard.noNewMessages'),
          [{ text: t('common.ok') }]
        );
      }
    } catch (err) {
      console.error("Error handling messages:", err);
      showCustomAlert(
        t('common.error'), 
        t('dashboard.fetchMessagesError'),
        [{ text: t('common.ok') }]
      );
    }
  };
  
  /**
   * Handle notifications button press
   */
  const handleNotificationsPress = async () => {
    try {
      // Mark notifications as read when navigating to notifications page
      if (unreadNotificationsCount > 0) {
        await supabase
          .from("notifications")
          .update({ read: true })
          .eq("user_id", userId)
          .eq("read", false);
          
        setUnreadNotificationsCount(0);
      }
      
      safeNavigate("services/Notification");
    } catch (err) {
      console.error("Error handling notifications:", err);
      showCustomAlert(
        t('common.error'), 
        t('dashboard.accessNotificationsError'),
        [{ text: t('common.ok') }]
      );
    }
  };
  
  /**
   * Handle logout
   */
  const handleLogout = async () => {
    showCustomAlert(
      t('dashboard.logout'), 
      t('dashboard.logoutConfirmation'), 
      [
        { text: t('common.cancel'), style: "cancel" },
        {
          text: t('dashboard.logoutButton'),
          style: "logout",
          onPress: async () => {
            try {
              await AsyncStorage.clear();
              removeAllSupabaseChannels();
              router.replace("/login");
            } catch (err) {
              console.warn("Logout error:", err);
              showCustomAlert(t('common.error'), t('dashboard.logoutError'), [
                { text: t('common.ok') }
              ]);
            }
          },
        },
      ]
    );
  };

  /***********************************
   * Search / Filter / Sort
   ***********************************/
  /**
   * Filter and sort produce based on search, filter, and sort criteria
   */
  const filteredProduce = useMemo(() => {
    let list = produce || [];
    
    // Apply search filter
    if (searchQuery?.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((p) => (p.crop_name || "").toLowerCase().includes(q));
    }
    
    // Apply stock filter
    if (filterStock === "in_stock") {
      list = list.filter((p) => Number(p.quantity) > 0);
    } else if (filterStock === "out_of_stock") {
      list = list.filter((p) => Number(p.quantity) <= 0);
    }
    
    // Apply sorting
    switch (sortBy) {
      case "price_asc":
        list = list.sort((a, b) => Number(a.price_per_kg || 0) - Number(b.price_per_kg || 0));
        break;
      case "price_desc":
        list = list.sort((a, b) => Number(b.price_per_kg || 0) - Number(a.price_per_kg || 0));
        break;
      case "qty_desc":
        list = list.sort((a, b) => Number(b.quantity || 0) - Number(a.quantity || 0));
        break;
      case "newest":
      default:
        list = list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }
    
    return list;
  }, [produce, searchQuery, filterStock, sortBy]);

  /***********************************
   * UI Helper Functions
   ***********************************/
  /**
   * Get display status for a crop item
   * @param {object} item - Crop item
   * @returns {string} Display status
   */
  const displayStatus = (item) => 
    Number(item.quantity) > 0 
      ? "in_stock" 
      : item.status === "in_stock" 
        ? "in_stock" 
        : "out_of_stock";
  
  /**
   * Show custom alert (web fallback for Alert.alert)
   * @param {string} title - Alert title
   * @param {string} message - Alert message
   * @param {array} buttons - Alert buttons
   */
  const showCustomAlert = (title, message, buttons = []) => {
    // Add OK button if no buttons provided
    const finalButtons = buttons.length > 0 ? buttons : [{ text: t('common.ok') }];
    
    if (Platform.OS === "web") {
      setAlertConfig({ 
        title, 
        message, 
        buttons: finalButtons
      });
      setShowAlertModal(true);
    } else {
      Alert.alert(title, message, finalButtons);
    }
  };

  /***********************************
   * Render Functions
   ***********************************/
  /**
   * Render a produce card
   * @param {object} item - Produce item
   * @returns {JSX.Element} Card component
   */
  const Card = ({ item }) => {
    const status = displayStatus(item);
    return (
      <View style={styles.gridCard}>
        <Image 
          source={{ uri: item.image_url || PLACEHOLDER }} 
          style={styles.gridImage} 
          resizeMode="cover" 
        />
        <View style={styles.gridInfo}>
          <Text style={styles.cropName} numberOfLines={1} ellipsizeMode="tail">
            {item.crop_name}
          </Text>
          <Text style={styles.cropMeta} numberOfLines={1}>
            {fmtCurrency(item.price_per_kg)} • {item.quantity}kg
          </Text>
          <View style={[
            styles.statusTag, 
            status === "in_stock" ? styles.inStock : styles.outStock
          ]}>
            <Text style={styles.statusText}>
              {status === "in_stock" ? t('dashboard.inStock') : t('dashboard.outOfStock')}
            </Text>
          </View>
          <View style={styles.cardActions}>
            <TouchableOpacity 
              style={[styles.actionButton, styles.editButton]} 
              onPress={() => openEditModal(item)} 
              accessibilityLabel={`${t('common.edit')} ${item.crop_name}`}
            >
              <Feather name="edit-2" size={14} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.actionButton, styles.deleteButton]} 
              onPress={() => handleDelete(item.id)} 
              accessibilityLabel={`${t('common.delete')} ${item.crop_name}`}
            >
              <Feather name="trash-2" size={14} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };
  
  /**
   * Render weather card
   * @returns {JSX.Element} Weather card component
   */
  const renderWeather = () => (
    <View style={styles.weatherCard}>
      {weatherLoading ? (
        <ActivityIndicator size="small" />
      ) : weatherError ? (
        <Text style={styles.weatherError}>{weatherError}</Text>
      ) : weather ? (
        <View style={styles.weatherRow}>
          <Text style={styles.weatherEmoji}>
            {getWeatherEmoji(weather.weather?.[0]?.main)}
          </Text>
          <View>
            <Text style={styles.weatherTemp}>
              {Math.round(weather.main?.temp ?? 0)}°C
            </Text>
            <Text style={styles.weatherDesc}>
              {weather.weather?.[0]?.description}
            </Text>
          </View>
        </View>
      ) : (
        <Text style={styles.weatherError}>{t('dashboard.weatherUnavailable')}</Text>
      )}
    </View>
  );
  
  /**
   * Render header section
   * @returns {JSX.Element} Header component
   */
  const renderHeader = () => (
    <View style={styles.topBar}>
      <View>
        <Text style={styles.helloText}>
          <Text style={styles.farmerEmoji}>👨‍🌾</Text> {t('dashboard.welcomeBack')},
        </Text>
        <Text style={styles.nameText}>{farmerName || t('dashboard.farmer')} 👋</Text>
      </View>
      <View style={styles.headerRight}>
        {/* Notification Button */}
        <TouchableOpacity 
          style={styles.iconBtn} 
          onPress={handleNotificationsPress}
          accessibilityLabel={t('dashboard.notifications')}
        >
          <Feather name="bell" size={20} color="#3B3B3B" />
          {unreadNotificationsCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadNotificationsCount}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.iconBtn} 
          onPress={handleLogout}
          accessibilityLabel={t('dashboard.logout')}
        >
          <Feather name="log-out" size={20} color="#FF5A5F" />
        </TouchableOpacity>
      </View>
    </View>
  );

  /***********************************
   * Main Render
   ***********************************/
  // Show loading indicator until language is loaded
  if (!languageLoaded) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1976D2" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Conditionally render StatusBar only for native platforms */}
      {Platform.OS !== 'web' && StatusBar && <StatusBar />}
      
      {renderHeader()}
      
      <MyScroll 
        style={{ flex: 1, overflow: Platform.OS === 'web' ? 'auto' : 'visible' }}
        contentContainerStyle={{ flexGrow: 1 }}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={() => { setRefreshing(true); fetchAll(); }} 
          />
        }
      >
        <View style={styles.container}>
          {renderWeather()}
          
          {/* Controls: Add, Search, Filter, Sort */}
          <View style={styles.controlsRow}>
            <View style={styles.searchBox}>
              <Feather name="search" size={16} color="#777" />
              <TextInput 
                placeholder={t('dashboard.searchCrops')} 
                placeholderTextColor="#999" 
                value={searchQuery} 
                onChangeText={setSearchQuery} 
                style={styles.searchInput} 
              />
            </View>
          </View>
          
          {/* New Filter and Sort Dropdowns */}
          <View style={styles.filterSortContainer}>
            {/* Filter Dropdown */}
            <View style={styles.dropdownContainer}>
              <Text style={styles.dropdownLabel}>{t('dashboard.stock')}</Text>
              <TouchableOpacity 
                style={styles.dropdownButton}
                onPress={() => {
                  setShowFilterDropdown(!showFilterDropdown);
                  setShowSortDropdown(false); // Close sort dropdown when opening filter
                }}
              >
                <Text style={styles.dropdownButtonText}>
                  {filterStock === 'all' ? t('dashboard.all') : 
                   filterStock === 'in_stock' ? t('dashboard.inStock') : t('dashboard.outOfStock')}
                </Text>
                <Feather 
                  name={showFilterDropdown ? "chevron-up" : "chevron-down"} 
                  size={16} 
                  color="#558B2F" 
                />
              </TouchableOpacity>
              
              {showFilterDropdown && (
                <View style={styles.dropdownOptions}>
                  {['all', 'in_stock', 'out_of_stock'].map(option => (
                    <TouchableOpacity
                      key={option}
                      style={[
                        styles.dropdownOption,
                        filterStock === option && styles.dropdownOptionSelected
                      ]}
                      onPress={() => {
                        setFilterStock(option);
                        setShowFilterDropdown(false);
                      }}
                    >
                      <Text style={[
                        styles.dropdownOptionText,
                        filterStock === option && styles.dropdownOptionTextSelected
                      ]}>
                        {option === 'all' ? t('dashboard.all') : 
                         option === 'in_stock' ? t('dashboard.inStock') : t('dashboard.outOfStock')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
            
            {/* Sort Dropdown */}
            <View style={styles.dropdownContainer}>
              <Text style={styles.dropdownLabel}>{t('dashboard.sort')}</Text>
              <TouchableOpacity 
                style={styles.dropdownButton}
                onPress={() => {
                  setShowSortDropdown(!showSortDropdown);
                  setShowFilterDropdown(false); // Close filter dropdown when opening sort
                }}
              >
                <Text style={styles.dropdownButtonText}>
                  {sortBy === 'newest' ? t('dashboard.newest') : 
                   sortBy === 'price_asc' ? t('dashboard.priceAsc') : 
                   sortBy === 'price_desc' ? t('dashboard.priceDesc') : t('dashboard.quantityDesc')}
                </Text>
                <Feather 
                  name={showSortDropdown ? "chevron-up" : "chevron-down"} 
                  size={16} 
                  color="#558B2F" 
                />
              </TouchableOpacity>
              
              {showSortDropdown && (
                <View style={styles.dropdownOptions}>
                  {[
                    { value: 'newest', label: t('dashboard.newest') },
                    { value: 'price_asc', label: t('dashboard.priceAsc') },
                    { value: 'price_desc', label: t('dashboard.priceDesc') },
                    { value: 'qty_desc', label: t('dashboard.quantityDesc') }
                  ].map(option => (
                    <TouchableOpacity
                      key={option.value}
                      style={[
                        styles.dropdownOption,
                        sortBy === option.value && styles.dropdownOptionSelected
                      ]}
                      onPress={() => {
                        setSortBy(option.value);
                        setShowSortDropdown(false);
                      }}
                    >
                      <Text style={[
                        styles.dropdownOptionText,
                        sortBy === option.value && styles.dropdownOptionTextSelected
                      ]}>
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          </View>
          
          {loading ? (
            <ActivityIndicator size="large" style={{ marginTop: 40 }} />
          ) : errorMsg ? (
            <View style={styles.emptyState}>
              <Feather name="alert-circle" size={48} color="#F44336" />
              <Text style={styles.errorText}>{errorMsg}</Text>
              <TouchableOpacity 
                style={styles.retryButton} 
                onPress={() => { setRefreshing(true); fetchAll(); }}
              >
                <Text style={styles.retryButtonText}>{t('common.retry')}</Text>
              </TouchableOpacity>
            </View>
          ) : filteredProduce.length === 0 ? (
            <View style={styles.emptyState}>
              <Feather name="package" size={48} color="#90A4AE" />
              <Text style={styles.emptyText}>{t('dashboard.noCropsListed')}</Text>
              <TouchableOpacity 
                style={styles.addButton} 
                onPress={() => setAddVisible(true)}
              >
                <Text style={styles.addButtonText}>{t('dashboard.addFirstCrop')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={filteredProduce}
              keyExtractor={(item) => String(item.id)}
              numColumns={2}
              columnWrapperStyle={styles.gridRow}
              renderItem={({ item }) => <Card item={item} />}
              contentContainerStyle={{ flexGrow: 1, paddingBottom: 130 }}
              scrollEnabled={false}
              style={{ flex: 1, overflow: Platform.OS === 'web' ? 'auto' : 'visible' }}
            />
          )}
        </View>
      </MyScroll>
      
      {/* Bottom Navigation */}
      <View style={styles.bottomNav}>
        <TouchableOpacity 
          style={styles.bottomIcon} 
          onPress={() => { /* home already here */ }}
          accessibilityLabel={t('dashboard.home')}
        >
          <Feather name="home" size={20} color="#1976D2" />
          <Text style={[styles.bottomLabel, { color: "#1976D2" }]}>{t('dashboard.home')}</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.bottomIcon} 
          onPress={() => safeNavigate("/drawer/add_produce")}
          accessibilityLabel={t('dashboard.addProduce')}
        >
          <Feather name="plus-circle" size={20} color="#333" />
          <Text style={styles.bottomLabel}>{t('dashboard.add')}</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.bottomIcon} 
          onPress={() => safeNavigate("/drawer/cropSuggestion")}
          accessibilityLabel={t('dashboard.cropSuggestions')}
        >
          <Feather name="bar-chart" size={20} color="#333" />
          <Text style={styles.bottomLabel}>{t('dashboard.suggestions')}</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.bottomIcon} 
          onPress={() => safeNavigate("/drawer/disease-alerts")}
          accessibilityLabel={t('dashboard.diseaseAlerts')}
        >
          <Feather name="activity" size={20} color="#333" />
          <Text style={styles.bottomLabel}>{t('dashboard.disease')}</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.bottomIcon} 
          onPress={handleMessagesPress}
          accessibilityLabel={t('dashboard.chat')}
        >
          <Feather name="message-circle" size={20} color="#333" />
          <Text style={styles.bottomLabel}>{t('dashboard.chat')}</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.bottomIcon} 
          onPress={() => safeNavigate("/drawer/profile")}
          accessibilityLabel={t('dashboard.profile')}
        >
          <Feather name="user" size={20} color="#333" />
          <Text style={styles.bottomLabel}>{t('dashboard.profile')}</Text>
        </TouchableOpacity>
      </View>
      
      {/* Edit Modal */}
      <Modal visible={editVisible} animationType="slide" transparent>
        <KeyboardAvoidingView 
          behavior={Platform.OS === "ios" ? "padding" : "height"} 
          style={styles.modalWrapper}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('dashboard.editCrop')}</Text>
            
            <Text style={styles.inputLabel}>{t('dashboard.cropName')}</Text>
            <TextInput 
              value={form.crop_name} 
              onChangeText={(t) => setForm((s) => ({ ...s, crop_name: t }))} 
              style={styles.input} 
              placeholder={t('dashboard.cropNamePlaceholder')} 
            />
            
            <Text style={styles.inputLabel}>{t('dashboard.price')}</Text>
            <TextInput 
              value={form.price_per_kg} 
              onChangeText={(t) => setForm((s) => ({ ...s, price_per_kg: t }))} 
              style={styles.input} 
              keyboardType="numeric" 
              placeholder={t('dashboard.pricePlaceholder')} 
            />
            
            <Text style={styles.inputLabel}>{t('dashboard.quantity')}</Text>
            <TextInput 
              value={form.quantity} 
              onChangeText={(t) => setForm((s) => ({ ...s, quantity: t }))} 
              style={styles.input} 
              keyboardType="numeric" 
              placeholder={t('dashboard.quantityPlaceholder')} 
            />
            
            <View style={styles.modalBtns}>
              <TouchableOpacity 
                style={[styles.modalBtn, { backgroundColor: "#9E9E9E" }]} 
                onPress={() => { 
                  setEditVisible(false); 
                  setEditingCrop(null); 
                }} 
                disabled={savingEdit}
              >
                <Text style={styles.modalBtnText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.modalBtn, { backgroundColor: "#1976D2" }]} 
                onPress={handleSaveUpdate} 
                disabled={savingEdit}
              >
                {savingEdit ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalBtnText}>{t('common.save')}</Text>
                )}
              </TouchableOpacity>
            </View>
            
            <Text style={styles.modalNote}>
              {t('dashboard.statusAutoSetNote')}
            </Text>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      
      {/* Web custom alert modal */}
      <Modal 
        transparent 
        visible={showAlertModal} 
        onRequestClose={() => setShowAlertModal(false)}
      >
        <View style={styles.alertBackdrop}>
          <View style={styles.alertContainer}>
            <Text style={styles.alertTitle}>{alertConfig.title}</Text>
            <Text style={styles.alertMessage}>{alertConfig.message}</Text>
            <View style={styles.alertButtons}>
              {alertConfig.buttons.map((button, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.alertButton, 
                    button.style === "cancel" && styles.alertButtonCancel,
                    button.style === "logout" && styles.alertButtonLogout,
                    button.style === "destructive" && styles.alertButtonDestructive
                  ]}
                  onPress={() => {
                    setShowAlertModal(false);
                    button.onPress?.();
                  }}
                >
                  <Text style={[
                    styles.alertButtonText, 
                    button.style === "cancel" && { color: "#1976D2" },
                    button.style === "logout" && { color: "#1976D2" },
                    button.style === "destructive" && { color: "#fff" }
                  ]}>
                    {button.text}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/***********************************
 * Styles
 ***********************************/
const styles = StyleSheet.create({
  // Main container
  safeArea: { 
    flex: 1, 
    backgroundColor: '#F5F9F1' // Light earthy background
  },
  // Header
  topBar: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderColor: '#E6EEDC',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 3,
  },
  helloText: { fontSize: 14, color: '#689F38', fontWeight: '500' },
  nameText: { fontSize: 22, fontWeight: '700', color: '#33691E', marginTop: 2 },
  farmerEmoji: { fontSize: 36, marginRight: 6 },
  headerRight: { flexDirection: "row", alignItems: "center" },
  iconBtn: { 
    marginLeft: 12, 
    backgroundColor: '#E8F5E9', 
    padding: 10, 
    borderRadius: 12, 
    position: "relative",
    shadowColor: '#8BC34A',
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  badge: { 
    position: "absolute", 
    top: -6, 
    right: -6, 
    backgroundColor: '#FF6D00',
    minWidth: 20, 
    height: 20, 
    borderRadius: 10, 
    justifyContent: "center", 
    alignItems: "center"
  },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: '700' },
  // Content
  container: { 
    padding: 18, 
    paddingBottom: 90,
    flexGrow: 1
  },
  weatherCard: { 
    backgroundColor: '#E3F2FD', 
    padding: 16, 
    borderRadius: 16, 
    marginVertical: 16,
    borderWidth: 1,
    borderColor: '#BBDEFB',
    shadowColor: '#64B5F6',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  weatherRow: { flexDirection: "row", alignItems: "center", justifyContent: 'space-between' },
  weatherEmoji: { fontSize: 42, marginRight: 16 },
  weatherTemp: { fontSize: 26, fontWeight: '700', color: '#0D47A1' },
  weatherDesc: { fontSize: 14, color: '#1565C0', textTransform: 'capitalize' },
  weatherError: { color: '#D32F2F', fontWeight: '600', textAlign: 'center' },
  // Search + filters
  controlsRow: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  searchBox: { 
    flex: 1, flexDirection: "row", alignItems: "center", 
    backgroundColor: '#fff', padding: 12, borderRadius: 14, 
    borderWidth: 1, borderColor: '#C5E1A5',
    shadowOpacity: 0.05, elevation: 2
  },
  searchInput: { marginLeft: 10, flex: 1, fontSize: 16, color: '#33691E' },
  
  // Filter and Sort Styles
  filterSortContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    zIndex: 10,
  },
  dropdownContainer: {
    flex: 1,
    marginHorizontal: 6,
  },
  dropdownLabel: {
    fontSize: 13,
    color: '#558B2F',
    fontWeight: '600',
    marginBottom: 6,
  },
  dropdownButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#C5E1A5',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: 48,
  },
  dropdownButtonText: {
    fontSize: 15,
    color: '#33691E',
    fontWeight: '500',
  },
  dropdownOptions: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#C5E1A5',
    borderRadius: 12,
    marginTop: 4,
    zIndex: 20,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  dropdownOption: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F8E9',
  },
  dropdownOptionSelected: {
    backgroundColor: '#F1F8E9',
  },
  dropdownOptionText: {
    fontSize: 15,
    color: '#33691E',
  },
  dropdownOptionTextSelected: {
    fontWeight: '600',
    color: '#33691E',
  },
  
  // Empty/Error states
  emptyState: { alignItems: "center", paddingVertical: 50 },
  emptyText: { marginTop: 16, fontSize: 18, color: '#558B2F', fontWeight: '600', textAlign: 'center' },
  errorText: { marginTop: 16, fontSize: 18, color: '#D32F2F', fontWeight: '600', textAlign: 'center' },
  // Buttons
  addButton: { 
    marginTop: 24, 
    backgroundColor: '#689F38', 
    paddingVertical: 14, 
    borderRadius: 30, 
    alignItems: 'center'
  },
  addButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  retryButton: { marginTop: 24, backgroundColor: '#43A047', paddingVertical: 14, borderRadius: 30, alignItems: 'center' },
  retryButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  // Grid cards
  gridRow: { justifyContent: "space-between", marginBottom: 18 },
  gridCard: { backgroundColor: '#fff', borderRadius: 16, padding: 14, width: CARD_WIDTH, borderWidth: 1, borderColor: '#E0E0E0', elevation: 3 },
  gridImage: { width: "100%", height: 130, borderRadius: 10, backgroundColor: '#F1F8E9', marginBottom: 10 },
  cropName: { fontSize: 17, fontWeight: '700', color: '#33691E' },
  cropMeta: { fontSize: 14, color: '#689F38', marginBottom: 8 },
  statusTag: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20, alignSelf: "flex-start" },
  inStock: { backgroundColor: '#E8F5E9', borderColor: '#A5D6A7' },
  outStock: { backgroundColor: '#FFEBEE', borderColor: '#EF9A9A' },
  statusText: { fontSize: 12, fontWeight: '600', color: '#33691E' },
  cardActions: { flexDirection: "row", justifyContent: "flex-end", marginTop: 8 },
  actionButton: { width: 36, height: 36, borderRadius: 18, justifyContent: "center", alignItems: "center" },
  editButton: { backgroundColor: '#42A5F5' },
  deleteButton: { backgroundColor: '#E53935' },
  // Bottom nav
  bottomNav: { flexDirection: "row", justifyContent: "space-around", alignItems: "center", height: 70, backgroundColor: '#fff', borderTopWidth: 1, borderColor: '#E0E0E0' },
  bottomIcon: { alignItems: "center", justifyContent: "center" },
  bottomLabel: { fontSize: 12, marginTop: 4, color: '#689F38' },
  activeBottomNav: { backgroundColor: 'rgba(139,195,74,0.15)', borderRadius: 12 },
  activeBottomNavText: { color: '#33691E', fontWeight: '700' },
  // Modal
  modalWrapper: { flex: 1, justifyContent: "flex-end", backgroundColor: 'rgba(0,0,0,0.5)' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#33691E', textAlign: 'center' },
  inputLabel: { fontSize: 14, color: '#558B2F', marginTop: 12 },
  input: { borderWidth: 1, borderColor: '#C5E1A5', borderRadius: 10, padding: 12, fontSize: 15, marginTop: 4, backgroundColor: '#fff' },
  modalBtns: { flexDirection: "row", marginTop: 20 },
  modalBtn: { flex: 1, marginHorizontal: 6, padding: 14, borderRadius: 12, alignItems: "center" },
  modalBtnText: { color: "#fff", fontWeight: '700' },
  modalNote: { fontSize: 12, color: '#888', marginTop: 10, textAlign: 'center' },
  // Alert
  alertBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: "center", alignItems: "center", padding: 24 },
  alertContainer: { backgroundColor: '#fff', borderRadius: 20, padding: 20, width: "90%", maxWidth: 400 },
  alertTitle: { fontSize: 18, fontWeight: '700', color: '#33691E', marginBottom: 10, textAlign: 'center' },
  alertMessage: { fontSize: 16, color: '#455A64', textAlign: 'center', marginBottom: 20 },
  alertButtons: { flexDirection: "row", justifyContent: "flex-end" },
  alertButton: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 10, marginLeft: 10 },
  alertButtonCancel: { backgroundColor: '#E0E0E0' },
  alertButtonLogout: { backgroundColor: '#E0E0E0' },
  alertButtonDestructive: { backgroundColor: '#E53935' },
  alertButtonText: { color: '#fff', fontWeight: '600' }
});