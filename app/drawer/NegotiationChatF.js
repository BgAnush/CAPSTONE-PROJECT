import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Voice from "@react-native-voice/voice";
import { useNavigation, useRoute } from "@react-navigation/native";
import * as Speech from "expo-speech";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  ImageBackground,
  PermissionsAndroid,
  Platform,
  Alert as RNAlert,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { Bubble, Day, GiftedChat, InputToolbar, Send, Time } from "react-native-gifted-chat";
import { supabase } from "../supabase/supabaseClient";

/* --------------------------- Configuration --------------------------- */
const SILENCE_TIMEOUT_MS = 6000; // auto-stop after silence
const OFFLINE_QUEUE_MAX = 200; // max queued messages to keep locally

const TRANSLATE_GOOGLE = "https://translate.googleapis.com/translate_a/single";
const DEFAULT_BG = require("../../assets/images/chatbg.jpeg"); // change if needed
const WINDOW = Dimensions.get("window");

/* -------------------------- Languages --------------------------- */
export const LANGUAGES = {
  en: "English",
  hi: "Hindi",
  kn: "Kannada",
  te: "Telugu",
  ta: "Tamil",
};

/* ------------------------- Utility Helpers -------------------------- */
/**
 * translateText(text, targetLang)
 * - Attempts to translate text using Google Translate API
 * - Returns translated text and detected language
 * - On failure returns original text
 */
async function translateText(text, targetLang) {
  if (!text) return { translatedText: "", detectedLanguage: null };
  if (!targetLang) return { translatedText: text, detectedLanguage: null };
  
  try {
    const res = await fetch(
      `${TRANSLATE_GOOGLE}?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`
    );
    
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data[0]) {
        const translatedText = data[0].map((p) => (Array.isArray(p) ? p[0] : p)).join("");
        const detectedLanguage = data[2] || null;
        return { translatedText, detectedLanguage };
      }
    }
  } catch (e) {
    console.warn("Google translate failed", e.message || e);
  }
  
  return { translatedText: text, detectedLanguage: null };
}

/**
 * safeParseInt - helper
 */
function safeParseInt(v, fallback = 0) {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? fallback : n;
}

/* ----------------------------- Main UI ------------------------------ */
export default function NegotiationChatF() {
  const navigation = useNavigation();
  const route = useRoute();
  const {
    conversationId: convoIdFromRoute,
    cropId,
    retailerId,
    cropName = "Crop Chat",
    retailerName = "Retailer",
  } = route.params || {};

  /* ---------- states ---------- */
  const [conversationId, setConversationId] = useState(convoIdFromRoute || null);
  const [farmerId, setFarmerId] = useState(null);
  const [farmerName, setFarmerName] = useState("Farmer");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inputText, setInputText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [voiceReady, setVoiceReady] = useState(false);
  const [mute, setMute] = useState(false);
  const [speechStatusMessage, setSpeechStatusMessage] = useState("");
  const [offlineQueue, setOfflineQueue] = useState([]);
  const [selectedLanguage, setSelectedLanguage] = useState(null); // Store user's preferred language

  /* ---------- refs ---------- */
  const recognitionRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const partialResultBufferRef = useRef("");
  const lastFinalResultRef = useRef("");
  const supabaseChannelRef = useRef(null);
  const mountedRef = useRef(true);
  const muteRef = useRef(mute); // Ref to track mute state for immediate access

  /* ---------- Update mute ref when state changes ---------- */
  useEffect(() => {
    muteRef.current = mute;
  }, [mute]);

  /* ---------- Stop TTS when component unmounts ---------- */
  useEffect(() => {
    return () => {
      try {
        Speech.stop();
      } catch (e) {
        console.warn("Error stopping speech on unmount:", e.message || e);
      }
    };
  }, []);

  /* ---------- Detect user's language on mount ---------- */
  useEffect(() => {
    const detectLanguage = async () => {
      try {
        // Try to get stored language preference
        const storedLang = await AsyncStorage.getItem("selectedLanguage");
        if (storedLang && LANGUAGES[storedLang]) {
          setSelectedLanguage(storedLang);
          return;
        }
        
        // If no stored preference, detect from device settings
        let deviceLang = 'en';
        if (Platform.OS === 'web') {
          deviceLang = navigator.language.split('-')[0];
        } else {
          // For native, we'll default to English but could use device locale in a real app
          deviceLang = 'en';
        }
        
        // Check if detected language is supported
        if (LANGUAGES[deviceLang]) {
          setSelectedLanguage(deviceLang);
          await AsyncStorage.setItem("selectedLanguage", deviceLang);
        } else {
          setSelectedLanguage('en');
          await AsyncStorage.setItem("selectedLanguage", 'en');
        }
      } catch (e) {
        console.warn("Language detection failed", e.message || e);
        setSelectedLanguage('en');
      }
    };
    
    detectLanguage();
  }, []);

  /* ---------- helper: silence timer ---------- */
  const resetSilenceTimeout = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
    }
    silenceTimerRef.current = setTimeout(() => {
      stopSpeechToText();
    }, SILENCE_TIMEOUT_MS);
  }, []);

  const clearSilenceTimeout = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  /* ---------- load local user (farmer) ---------- */
  useEffect(() => {
    mountedRef.current = true;
    (async () => {
      try {
        const id = await AsyncStorage.getItem("userId");
        const name = await AsyncStorage.getItem("userName");
        if (id) setFarmerId(id);
        if (name) setFarmerName(name);
      } catch (e) {
        console.warn("failed to read user info", e.message || e);
      }
    })();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /* ---------- speech initialization (web + native) ---------- */
  useEffect(() => {
    (async () => {
      try {
        if (Platform.OS === "web") {
          // Check if Web Speech API is available
          const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
          if (!SpeechRecognition) {
            console.warn("Web Speech API not available");
            setVoiceReady(false);
            return;
          }
          
          // Just set voiceReady to true, we'll create recognition instances on demand
          setVoiceReady(true);
        } else {
          // native init using react-native-voice
          if (!Voice) {
            console.warn("Voice module not available");
            setVoiceReady(false);
            return;
          }
          
          try {
            await Voice.destroy();
            Voice.removeAllListeners();
            
            Voice.onSpeechStart = () => {
              if (!mountedRef.current) return;
              setIsRecording(true);
              partialResultBufferRef.current = "";
              lastFinalResultRef.current = "";
              setSpeechStatusMessage("listening...");
            };
            
            Voice.onSpeechResults = (res) => {
              if (!mountedRef.current) return;
              clearSilenceTimeout();
              
              if (res?.value?.length) {
                const val = res.value[0];
                if (val && val !== lastFinalResultRef.current) {
                  partialResultBufferRef.current = (partialResultBufferRef.current + " " + val).trim();
                  lastFinalResultRef.current = val;
                  setInputText(partialResultBufferRef.current);
                }
                resetSilenceTimeout();
              }
            };
            
            Voice.onSpeechError = (e) => {
              console.error("voice native error", e);
              setIsRecording(false);
              setVoiceReady(false);
              setSpeechStatusMessage("speech error");
              clearSilenceTimeout();
            };
            
            Voice.onSpeechEnd = () => {
              setIsRecording(false);
              setSpeechStatusMessage("");
              clearSilenceTimeout();
            };
            
            Voice.onSpeechPartialResults = (res) => {
              if (!mountedRef.current) return;
              clearSilenceTimeout();
              
              if (res?.value?.length) {
                const val = res.value[0];
                if (val) {
                  setInputText(partialResultBufferRef.current + " " + val);
                }
                resetSilenceTimeout();
              }
            };
            
            setVoiceReady(true);
          } catch (e) {
            console.warn("voice init failed", e.message || e);
            setVoiceReady(false);
          }
        }
      } catch (e) {
        console.error("speech init exception", e.message || e);
        setVoiceReady(false);
      }
    })();
    
    return () => {
      // cleanup
      (async () => {
        if (Platform.OS !== "web") {
          try {
            if (Voice) {
              await Voice.destroy();
              Voice.removeAllListeners();
            }
          } catch (ignore) {}
        } else {
          if (recognitionRef.current) {
            try {
              recognitionRef.current.stop();
            } catch (ignore) {}
            recognitionRef.current = null;
          }
        }
        clearSilenceTimeout();
      })();
    };
  }, []);

  /* ---------- create web speech recognition instance ---------- */
  const createWebRecognition = useCallback(() => {
    if (Platform.OS !== "web") return null;
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      RNAlert.alert("Error", "Speech recognition not supported on this device.");
      return null;
    }
    
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    // Set language based on user's preferred language
    recognition.lang = selectedLanguage === 'kn' ? 'kn-IN' : 
                      selectedLanguage === 'hi' ? 'hi-IN' : 
                      selectedLanguage === 'te' ? 'te-IN' : 
                      selectedLanguage === 'ta' ? 'ta-IN' : 'en-US';
    
    recognition.onstart = () => {
      if (!mountedRef.current) return;
      setIsRecording(true);
      partialResultBufferRef.current = "";
      lastFinalResultRef.current = "";
      setSpeechStatusMessage("listening...");
    };
    
    recognition.onresult = (event) => {
      if (!mountedRef.current) return;
      clearSilenceTimeout();
      
      let interim = "";
      let final = "";
      
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }
      
      if (final && final !== lastFinalResultRef.current) {
        partialResultBufferRef.current = (partialResultBufferRef.current + " " + final).trim();
        lastFinalResultRef.current = final;
      }
      
      const display = (partialResultBufferRef.current + (interim ? " " + interim : "")).trim();
      setInputText(display);
      resetSilenceTimeout();
    };
    
    recognition.onerror = (event) => {
      console.error("Web speech error:", event.error);
      setIsRecording(false);
      setSpeechStatusMessage(`Error: ${event.error}`);
      clearSilenceTimeout();
      
      // Show user-friendly error messages
      let errorMessage = "Speech recognition error";
      if (event.error === 'no-speech') {
        errorMessage = "No speech detected. Please try again.";
      } else if (event.error === 'audio-capture') {
        errorMessage = "No microphone was found or access was denied.";
      } else if (event.error === 'not-allowed') {
        errorMessage = "Microphone permission was denied.";
      } else if (event.error === 'network') {
        errorMessage = "Network error occurred during speech recognition.";
      }
      
      RNAlert.alert("Speech Error", errorMessage);
    };
    
    recognition.onend = () => {
      if (!mountedRef.current) return;
      setIsRecording(false);
      setSpeechStatusMessage("");
      clearSilenceTimeout();
    };
    
    return recognition;
  }, [selectedLanguage]);

  /* ---------- start speech-to-text ---------- */
  const requestAudioPermission = async () => {
    if (Platform.OS !== "android") return true;
    
    try {
      const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
        title: "Microphone Permission",
        message: "This app needs access to your microphone for speech input.",
        buttonNeutral: "Ask Me Later",
        buttonNegative: "Cancel",
        buttonPositive: "OK",
      });
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch (e) {
      console.warn("permission ask failed", e.message || e);
      return false;
    }
  };

  const startSpeechToText = async () => {
    if (!voiceReady) {
      RNAlert.alert("Voice not supported", "Voice recognition is not supported on this device.");
      return;
    }
    
    const ok = await requestAudioPermission();
    if (!ok) {
      RNAlert.alert("Permission denied", "Microphone permission is required for voice input.");
      return;
    }
    
    try {
      partialResultBufferRef.current = "";
      lastFinalResultRef.current = "";
      setInputText("");
      clearSilenceTimeout();
      
      // Set language based on user's preferred language
      const speechLang = selectedLanguage === 'kn' ? 'kn-IN' : 
                        selectedLanguage === 'hi' ? 'hi-IN' : 
                        selectedLanguage === 'te' ? 'te-IN' : 
                        selectedLanguage === 'ta' ? 'ta-IN' : 'en-US';
      
      if (Platform.OS === "web") {
        // Create a new recognition instance each time
        const recognition = createWebRecognition();
        if (!recognition) {
          RNAlert.alert("Error", "Failed to initialize speech recognition.");
          return;
        }
        
        // Stop any existing recognition
        if (recognitionRef.current) {
          try {
            recognitionRef.current.stop();
          } catch (e) {
            console.warn("Error stopping previous recognition:", e);
          }
        }
        
        recognitionRef.current = recognition;
        recognition.start();
        setIsRecording(true);
        resetSilenceTimeout();
      } else {
        if (!Voice) {
          RNAlert.alert("Error", "Voice recognition not available.");
          return;
        }
        await Voice.start(speechLang);
        setIsRecording(true);
        resetSilenceTimeout();
      }
    } catch (e) {
      console.error("start speech error", e.message || e);
      setIsRecording(false);
      clearSilenceTimeout();
      RNAlert.alert("Speech Error", "Could not start speech recognition. Try again.");
    }
  };

  /* ---------- stop speech-to-text ---------- */
  const stopSpeechToText = async () => {
    clearSilenceTimeout();
    try {
      if (Platform.OS === "web") {
        if (recognitionRef.current) {
          try {
            recognitionRef.current.stop();
          } catch (e) {
            console.warn("Error stopping web recognition:", e);
          }
          // Don't set to null immediately, let onend handle cleanup
        }
      } else {
        if (Voice) {
          try {
            await Voice.stop();
          } catch (ignore) {}
        }
      }
    } catch (e) {
      console.warn("error stopping voice", e.message || e);
    } finally {
      setIsRecording(false);
    }
  };

  /* ---------------------- conversation helpers ---------------------- */
  const getOrCreateConversation = useCallback(
    async (skipReturn = false) => {
      if (conversationId && !skipReturn) return conversationId;
      if (!farmerId || !cropId || !retailerId) return null;
      
      try {
        const { data: existing, error: exErr } = await supabase
          .from("conversations")
          .select("id")
          .eq("crop_id", cropId)
          .eq("farmer_id", farmerId)
          .eq("retailer_id", retailerId)
          .maybeSingle();
          
        if (exErr) console.warn("conv exist err", exErr.message || exErr);
        if (existing?.id) {
          setConversationId(existing.id);
          return existing.id;
        }
        
        const { data: created, error: createErr } = await supabase
          .from("conversations")
          .insert([
            {
              crop_id: cropId,
              farmer_id: farmerId,
              retailer_id: retailerId,
              last_message: "Conversation started",
              last_message_at: new Date().toISOString(),
            },
          ])
          .select()
          .single();
          
        if (createErr) {
          console.warn("create conv err", createErr.message || createErr);
          return null;
        }
        
        setConversationId(created.id);
        return created.id;
      } catch (e) {
        console.error("getOrCreateConversation exception", e.message || e);
        return null;
      }
    },
    [conversationId, farmerId, cropId, retailerId]
  );

  /* ----------------------- fetch messages -------------------------- */
  const fetchMessages = useCallback(
    async (convId) => {
      if (!convId) return;
      setLoading(true);
      
      try {
        const { data, error } = await supabase
          .from("messages")
          .select("*")
          .eq("conversation_id", convId)
          .order("created_at", { ascending: false });
          
        if (error) {
          console.warn("fetchMessages error", error.message || error);
          setLoading(false);
          return;
        }
        
        if (!data) {
          setMessages([]);
          setLoading(false);
          return;
        }
        
        // Format messages and translate to user's language if needed
        const formatted = await Promise.all(
          data.map(async (m) => {
            let txt = m.content;
            
            // If message is not in user's preferred language, translate it
            if (selectedLanguage && selectedLanguage !== 'en') {
              try {
                const { translatedText } = await translateText(txt, selectedLanguage);
                txt = translatedText;
              } catch (e) {
                console.warn("translate failed", e.message || e);
              }
            }
            
            return {
              _id: m.id.toString(),
              text: txt,
              createdAt: new Date(m.created_at),
              user: {
                _id: m.sender_id,
                name: m.sender_id === farmerId ? farmerName : retailerName || "Retailer",
              },
            };
          })
        );
        
        setMessages(formatted);
      } catch (e) {
        console.error("fetchMessages exception", e.message || e);
      } finally {
        setLoading(false);
      }
    },
    [farmerId, farmerName, retailerName, selectedLanguage]
  );

  /* --------------- setup realtime subscription --------------------- */
  useEffect(() => {
    if (!farmerId) return;
    let subscribed = true;
    let channelLocal = null;
    
    (async () => {
      const convId = await getOrCreateConversation();
      if (!convId) return;
      await fetchMessages(convId);
      
      const channelName = `messages_conv_${convId}`;
      try {
        if (supabaseChannelRef.current) {
          try {
            await supabase.removeChannel(supabaseChannelRef.current);
          } catch (e) {}
          supabaseChannelRef.current = null;
        }
        
        channelLocal = supabase
          .channel(channelName)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "messages",
              filter: `conversation_id=eq.${convId}`,
            },
            (payload) => {
              if (!subscribed) return;
              fetchMessages(convId);
            }
          )
          .subscribe((status) => {
            if (status === "SUBSCRIBED") {
              supabaseChannelRef.current = channelLocal;
            }
          });
      } catch (e) {
        console.warn("supabase subscription error", e.message || e);
      }
    })();
    
    return () => {
      subscribed = false;
      (async () => {
        if (supabaseChannelRef.current) {
          try {
            await supabase.removeChannel(supabaseChannelRef.current);
          } catch (e) {}
          supabaseChannelRef.current = null;
        }
      })();
    };
  }, [farmerId, getOrCreateConversation, fetchMessages]);

  /* ------------------ offline queue flushing ----------------------- */
  useEffect(() => {
    const flush = async () => {
      if (!offlineQueue || offlineQueue.length === 0) return;
      
      try {
        for (const msg of offlineQueue) {
          const { error } = await supabase.from("messages").insert([msg]);
          if (error) throw error;
        }
        setOfflineQueue([]);
        await AsyncStorage.removeItem("offlineQueueMessages");
      } catch (e) {
        console.warn("failed to flush offline queue", e.message || e);
      }
    };
    
    flush();
  }, [offlineQueue]);

  /* ---------- utility to persist offline queue ---------- */
  const persistOfflineQueue = useCallback(async (queue) => {
    try {
      await AsyncStorage.setItem("offlineQueueMessages", JSON.stringify(queue.slice(-OFFLINE_QUEUE_MAX)));
    } catch (e) {
      console.warn("failed to persist queue", e.message || e);
    }
  }, []);

  /* ---------- load offline queue on mount ---------- */
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem("offlineQueueMessages");
        if (raw) {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr) && arr.length) setOfflineQueue(arr);
        }
      } catch (e) {
        console.warn("failed to load offline queue", e.message || e);
      }
    })();
  }, []);

  /* ----------------------- send message --------------------------- */
  const onSend = useCallback(
    async (newMsgs = []) => {
      if (!conversationId || !farmerId || !newMsgs.length) return;
      
      let txt = newMsgs[0].text || "";
      let detectedLang = null;
      
      // Detect language and translate to English for storage
      try {
        const { translatedText, detectedLanguage } = await translateText(txt, "en");
        txt = translatedText;
        detectedLang = detectedLanguage;
        
        // Update user's language preference if we detected a different language
        if (detectedLanguage && detectedLanguage !== selectedLanguage && LANGUAGES[detectedLanguage]) {
          setSelectedLanguage(detectedLanguage);
          await AsyncStorage.setItem("selectedLanguage", detectedLanguage);
        }
      } catch (e) {
        console.warn("outgoing translate failed", e.message || e);
      }
      
      try {
        const { error } = await supabase.from("messages").insert([
          {
            conversation_id: conversationId,
            sender_id: farmerId,
            content: txt,
          },
        ]);
        
        if (error) throw error;
        setInputText("");
        partialResultBufferRef.current = "";
      } catch (e) {
        console.error("message insert error", e.message || e);
        // buffer it locally
        const queued = [...offlineQueue, { conversation_id: conversationId, sender_id: farmerId, content: txt }];
        setOfflineQueue(queued.slice(-OFFLINE_QUEUE_MAX));
        persistOfflineQueue(queued);
        RNAlert.alert("Offline", "Message queued locally and will be sent when connection restores.");
      }
    },
    [conversationId, farmerId, offlineQueue, persistOfflineQueue, selectedLanguage]
  );

  /* ------------------ TTS toggle function -------------------------- */
  const toggleMute = useCallback(() => {
    setMute((prev) => {
      const newMute = !prev;
      muteRef.current = newMute; // Update ref immediately
      // Stop any ongoing speech when muted
      if (newMute) {
        try {
          Speech.stop();
        } catch (e) {
          console.warn("Error stopping speech:", e.message || e);
        }
      }
      return newMute;
    });
  }, []);

  /* ------------------ speakMessage function with mute check ------------------ */
  const speakMessage = useCallback((text) => {
    // Check mute state using ref for immediate access
    if (!text || muteRef.current) return;
    
    try {
      Speech.stop();
      // Speak in user's preferred language
      const speechLang = selectedLanguage === 'kn' ? 'kn-IN' : 
                        selectedLanguage === 'hi' ? 'hi-IN' : 
                        selectedLanguage === 'te' ? 'te-IN' : 
                        selectedLanguage === 'ta' ? 'ta-IN' : 'en-US';
      Speech.speak(text, { language: speechLang });
    } catch (e) {
      console.warn("TTS error:", e.message || e);
    }
  }, [selectedLanguage]);

  /* ------------------ Custom Time component without grey background ------------------ */
  const renderTime = (props) => {
    return (
      <Time
        {...props}
        textStyle={{
          left: { color: '#616161', fontSize: 10 },
          right: { color: '#616161', fontSize: 10 },
        }}
      />
    );
  };

  /* ------------------ Custom Day component with background ------------------ */
  const renderDay = (props) => {
    return (
      <View style={styles.dayContainer}>
        <Day
          {...props}
          textStyle={styles.dayText}
        />
      </View>
    );
  };

  /* ------------------ loading state UI ------------------------------ */
  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#2E7D32" />
        {/* Custom Header */}
        <View style={styles.header}>
          <TouchableOpacity 
            onPress={() => navigation.navigate("drawer/ConversationalList")}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{cropName || "Crop Chat"}</Text>
          <View style={styles.headerRight}>
            <TouchableOpacity onPress={toggleMute} style={{ marginHorizontal: 6 }}>
              <Ionicons name={mute ? "volume-mute-outline" : "volume-high-outline"} size={22} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
        
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={{ marginTop: 8 }}>Loading chat...</Text>
        </View>
      </SafeAreaView>
    );
  }

  /* -------------------- main render ------------------------------- */
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#2E7D32" />
      
      {/* Custom Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => navigation.navigate("drawer/ConversationalList")}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{cropName || "Crop Chat"}</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={toggleMute} style={{ marginHorizontal: 6 }}>
            <Ionicons name={mute ? "volume-mute-outline" : "volume-high-outline"} size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
      
      {/* Main content area with background image */}
      <ImageBackground source={DEFAULT_BG} style={styles.backgroundImage}>
        {/* Chat container with fixed height */}
        <View style={styles.chatContainer}>
          <GiftedChat
            messages={messages}
            onSend={(msgs) => onSend(msgs)}
            user={{ _id: farmerId, name: farmerName }}
            renderBubble={(props) => (
              <Bubble
                {...props}
                wrapperStyle={{
                  right: { backgroundColor: "#4CAF50", borderRadius: 18, padding: 8 },
                  left: { backgroundColor: "#E8F5E9", borderRadius: 18, padding: 8 },
                }}
                textStyle={{ right: { color: "#fff" }, left: { color: "#2E7D32" } }}
                onPress={() => speakMessage(props.currentMessage?.text || "")}
                renderTime={renderTime}
              />
            )}
            renderSend={(props) => (
              <Send
                {...props}
                containerStyle={styles.sendButton}
              >
                <Ionicons name="send" size={24} color="#4CAF50" />
              </Send>
            )}
            renderInputToolbar={(props) => (
              <InputToolbar
                {...props}
                containerStyle={styles.inputToolbarContainer}
                primaryStyle={styles.inputToolbarPrimary}
                renderActions={() => {
                  // Show mic button on all platforms
                  return (
                    <TouchableOpacity
                      onPress={() => (isRecording ? stopSpeechToText() : startSpeechToText())}
                      style={styles.micButton}
                      accessibilityLabel={isRecording ? "Stop recording" : "Start recording"}
                    >
                      <Ionicons name={isRecording ? "mic" : "mic-outline"} size={24} color={isRecording ? "red" : "#4CAF50"} />
                    </TouchableOpacity>
                  );
                }}
              />
            )}
            text={inputText}
            onInputTextChanged={setInputText}
            placeholder="Type a message..."
            alwaysShowSend
            keyboardShouldPersistTaps="handled"
            renderDay={renderDay}
            // Set the messages container style to have a fixed height
            messagesContainerStyle={styles.messagesContainer}
          />
        </View>
      </ImageBackground>
    </SafeAreaView>
  );
}

/* ---------------------------- Styles ------------------------------- */
const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: "#fff",
    // Prevent container from scrolling
    overflow: 'hidden',
  },
  header: {
    backgroundColor: "#2E7D32",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 16,
    height: 60,
  },
  backButton: { padding: 4 },
  headerTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
    flex: 1,
    textAlign: "center",
    marginHorizontal: 8,
  },
  headerRight: { flexDirection: "row", alignItems: "center" },
  backgroundImage: { 
    flex: 1,
    // Prevent background from scrolling
    overflow: 'hidden',
  },
  // New container for chat with fixed height
  chatContainer: {
    flex: 1,
    // Prevent container from scrolling
    overflow: 'hidden',
  },
  // Fixed height for messages container
  messagesContainer: {
    // This ensures only the messages scroll, not the entire screen
    flex: 1,
    paddingBottom: 10, // Add some padding at the bottom
  },
  centerContainer: { 
    flex: 1, 
    justifyContent: "center", 
    alignItems: "center",
    backgroundColor: "#fff",
  },
  sendButton: {
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
    height: 40,
    width: 40,
    borderRadius: 20,
    backgroundColor: '#E8F5E9',
  },
  micButton: {
    marginLeft: 6,
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f0f0f0",
    elevation: 2,
  },
  inputToolbarContainer: {
    borderTopWidth: 0,
    paddingTop: 6,
    paddingBottom: 6,
    backgroundColor: "transparent",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  inputToolbarPrimary: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 50,
    borderRadius: 25,
    marginHorizontal: 8,
    paddingHorizontal: 6,
    backgroundColor: "rgba(255,255,255,0.95)",
  },
  dayContainer: {
    backgroundColor: 'rgba(46, 125, 50, 0.1)',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 12,
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  dayText: { color: '#2E7D32', fontSize: 12, fontWeight: '600' },
});