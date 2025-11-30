import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import * as Speech from "expo-speech";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  ImageBackground,
  Platform,
  Alert as RNAlert,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { Bubble, Composer, Day, GiftedChat, InputToolbar, Send, Time } from "react-native-gifted-chat";
import i18n, { initLanguage } from "../languages/i18n";
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
export default function NegotiationChat() {
  const navigation = useNavigation();
  const route = useRoute();
  const {
    crop_id,
    farmer_id,
    retailer_id,
    currentUserId,
    cropName,
    farmerName,
    retailerName
  } = route.params || {};

  /* ---------- states ---------- */
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [conversationId, setConversationId] = useState(null);
  const [error, setError] = useState(null);
  const [selectedLang, setSelectedLang] = useState("en");
  const [isRecording, setIsRecording] = useState(false);
  const [voiceReady, setVoiceReady] = useState(false);
  const [mute, setMute] = useState(false);
  const [inputText, setInputText] = useState("");
  const recognitionRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const partialResultBufferRef = useRef("");
  const lastFinalResultRef = useRef("");
  const muteRef = useRef(mute);

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

  /* ---------- Initialize language on mount ---------- */
  useEffect(() => {
    const setupLanguage = async () => {
      try {
        const lang = await initLanguage();
        setSelectedLang(lang);
      } catch (error) {
        console.error("Error initializing language:", error);
        setSelectedLang("en");
      }
    };
    
    setupLanguage();
  }, []);

  /* ---------- Helper function for formatted user names ---------- */
  const getFormattedUserName = useCallback((userId, name, isFarmer) => {
    if (name) {
      return i18n.t(isFarmer ? "farmer_name" : "retailer_name", { name });
    }
    return i18n.t(isFarmer ? "farmer" : "retailer");
  }, [i18n]);

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

  // Initialize speech recognition - only for web
  useEffect(() => {
    const initVoice = async () => {
      if (Platform.OS === "web") {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) {
          setVoiceReady(false);
          return;
        }

        const rec = new SR();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = selectedLang === 'kn' ? 'kn-IN' : 
                      selectedLang === 'hi' ? 'hi-IN' : 
                      selectedLang === 'te' ? 'te-IN' : 
                      selectedLang === 'ta' ? 'ta-IN' : 'en-US';

        rec.onstart = () => {
          setIsRecording(true);
          partialResultBufferRef.current="";
          lastFinalResultRef.current="";
        };

        rec.onresult = e => {
          clearSilenceTimeout();
          let interim = "", final = "";
          for (let i = e.resultIndex; i < e.results.length; i++) {
            if (e.results[i].isFinal) final += e.results[i][0].transcript;
            else interim += e.results[i][0].transcript;
          }
          if(final && final !== lastFinalResultRef.current){
            partialResultBufferRef.current = (partialResultBufferRef.current+" "+final).trim();
            lastFinalResultRef.current = final;
          }
          if(recognitionRef.current) setInputText((partialResultBufferRef.current + (interim?" "+interim:"")).trim());
          resetSilenceTimeout();
        };

        rec.onerror = () => {
          setIsRecording(false);
          setVoiceReady(false);
          clearSilenceTimeout();
        };

        rec.onend = () => {
          setIsRecording(false);
          clearSilenceTimeout();
        };

        recognitionRef.current = rec;
        setVoiceReady(true);
      } else {
        // For Android, we don't initialize STT
        setVoiceReady(false);
      }
    };

    initVoice();

    return () => {
      (async () => {
        if (Platform.OS === "web" && recognitionRef.current) {
          try{
            recognitionRef.current.stop();
          }catch{}
          recognitionRef.current=null;
        }
        clearSilenceTimeout();
      })();
    };
  }, [selectedLang]);

  const requestAudioPermission = async () => {
    if (Platform.OS !== "android") return true;
    const { PermissionsAndroid } = await import("react-native");
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      { 
        title: i18n.t("microphone_permission_required"),
        message: i18n.t("microphone_permission_required"),
        buttonPositive: i18n.t("ok")
      }
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  };

  const startSpeechToText = async () => {
    if(!voiceReady){
      RNAlert.alert(i18n.t("error"), i18n.t("voice_not_supported"));
      return;
    }

    if(!await requestAudioPermission()){
      RNAlert.alert(i18n.t("permission_denied"), i18n.t("microphone_permission_required"));
      return;
    }

    partialResultBufferRef.current = "";
    lastFinalResultRef.current="";

    if(Platform.OS==="web"){
      recognitionRef.current.start();
      setIsRecording(true);
      resetSilenceTimeout();
    }
  };

  const stopSpeechToText = async () => {
    clearSilenceTimeout();
    try{
      if(Platform.OS==="web" && recognitionRef.current) {
        recognitionRef.current.stop();
      }
    }catch{}
    setIsRecording(false);
  };

  const toggleMute = useCallback(()=>{
    setMute(prev=>{
      Speech.stop();
      muteRef.current=!prev;
      return !prev;
    });
  }, []);

  // TTS works on both web and Android
  const speakMessage = useCallback((text,lang)=>{
    if(!text||muteRef.current) return;
    Speech.stop();
    const speechLang = lang === 'kn' ? 'kn-IN' : 
                      lang === 'hi' ? 'hi-IN' : 
                      lang === 'te' ? 'te-IN' : 
                      lang === 'ta' ? 'ta-IN' : 'en-US';
    Speech.speak(text,{ language: speechLang });
  }, []);

  const renderTime = props => <Time {...props} textStyle={{ 
    left:{color:'#616161', fontSize:10}, 
    right:{color:'#616161', fontSize:10} 
  }}/>;

  if(!crop_id||!farmer_id||!retailer_id||!currentUserId) return (
    <View style={styles.errorContainer}>
      <Text style={styles.errorText}>⚠️ {i18n.t("missing_chat_parameters")}</Text>
      <TouchableOpacity style={styles.backButton} onPress={()=>navigation.goBack()}>
        <Text style={styles.backButtonText}>{i18n.t("go_back")}</Text>
      </TouchableOpacity>
    </View>
  );

  const initializeConversation = useCallback(async ()=>{
    try{
      const {data:existing} = await supabase.from('conversations').select('id').eq('crop_id',crop_id).eq('farmer_id',farmer_id).eq('retailer_id',retailer_id).single();
      if(existing){ 
        setConversationId(existing.id); 
        return existing.id; 
      }
      const { data:newConv, error:createErr } = await supabase.from('conversations').insert([{
        crop_id,
        farmer_id,
        retailer_id,
        last_message: i18n.t("conversation_started"),
        last_message_at: new Date().toISOString()
      }]).select().single();
      if(createErr) throw createErr;
      setConversationId(newConv.id); 
      return newConv.id;
    }catch(e){ 
      setError(i18n.t("failed_to_start_conversation")); 
      return null; 
    }
  }, [crop_id,farmer_id,retailer_id]);

  const fetchMessages = useCallback(async convId=>{
    if(!convId) return;
    try{
      const { data, error } = await supabase.from('messages').select('*').eq('conversation_id',convId).order('created_at',{ascending:false});
      if(error) throw error;
      
      // Format messages and translate to user's language if needed
      const formatted = await Promise.all(
        data.map(async (msg) => {
          let txt = msg.content;
          
          // If message is not in user's preferred language, translate it
          if (selectedLang && selectedLang !== 'en') {
            try {
              const { translatedText } = await translateText(txt, selectedLang);
              txt = translatedText;
            } catch (e) {
              console.warn("translate failed", e.message || e);
            }
          }
          
          return {
            _id: msg.id, 
            text: txt, 
            createdAt: new Date(msg.created_at), 
            user:{ 
              _id: msg.sender_id, 
              name: msg.sender_id === farmer_id 
                ? getFormattedUserName(farmer_id, farmerName, true)
                : getFormattedUserName(retailer_id, retailerName, false)
            }
          };
        })
      );
      
      setMessages(formatted);
    }catch{ 
      setError(i18n.t("failed_to_load_messages")); 
    }
    finally{ 
      setLoading(false); 
    }
  }, [farmer_id, farmerName, retailerName, selectedLang, getFormattedUserName]);

  useEffect(()=>{
    let subscription;
    const setupRealtime = async ()=>{
      const convId = await initializeConversation();
      if(!convId) return;
      await fetchMessages(convId);
      subscription = supabase.channel(`messages:conversation_id=eq.${convId}`).on(
        'postgres_changes',
        { 
          event:'INSERT', 
          schema:'public', 
          table:'messages', 
          filter:`conversation_id=eq.${convId}` 
        }, 
        payload=>{
          const newMsg = payload.new;
          setMessages(prev=>GiftedChat.append(prev,{
            _id: newMsg.id, 
            text: newMsg.content, 
            createdAt: new Date(newMsg.created_at), 
            user:{ 
              _id: newMsg.sender_id, 
              name: newMsg.sender_id === farmer_id 
                ? getFormattedUserName(farmer_id, farmerName, true)
                : getFormattedUserName(retailer_id, retailerName, false)
            }
          }));
        }
      ).subscribe();
    };
    setupRealtime();
    return ()=>subscription && supabase.removeChannel(subscription);
  }, [initializeConversation, fetchMessages, getFormattedUserName]);

  const onSend = useCallback(async (newMessages=[])=>{
    if(!conversationId) return;
    try{
      let txt = newMessages[0].text;
      if(selectedLang!=="en") txt = await translateText(txt,"en");
      await supabase.from('messages').insert([{ 
        conversation_id:conversationId, 
        sender_id:currentUserId, 
        content:txt 
      }]);
      await supabase.from('conversations').update({ 
        last_message:txt.substring(0,50)+(txt.length>50?'...':''), 
        last_message_at: new Date().toISOString(), 
        last_sender:currentUserId 
      }).eq('id',conversationId);
      setInputText(""); // Clear input after sending
    }catch{ 
      RNAlert.alert(i18n.t('error'), i18n.t('failed_to_send_message')); 
    }
  }, [conversationId, currentUserId, selectedLang]);

  if(loading) return (
    <ImageBackground 
      source={DEFAULT_BG} 
      style={styles.background} 
      resizeMode="cover"
    >
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4CAF50"/>
        <Text style={styles.loadingText}>{i18n.t("loading_conversation")}</Text>
      </View>
    </ImageBackground>
  );
  
  if(error) return (
    <ImageBackground 
      source={DEFAULT_BG} 
      style={styles.background} 
      resizeMode="cover"
    >
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity 
          style={styles.retryButton} 
          onPress={()=>{ 
            setError(null); 
            setLoading(true); 
            initializeConversation().then(fetchMessages); 
          }}
        >
          <Text style={styles.retryButtonText}>{i18n.t("retry")}</Text>
        </TouchableOpacity>
      </View>
    </ImageBackground>
  );

  const renderChatHeader = () => (
    <View style={styles.header}>
      <TouchableOpacity 
        style={styles.backButton} 
        onPress={() => navigation.reset({
          index: 0,
          routes: [{ name: '(tabs)/retailerDashboard' }],
        })}
      >
        <Ionicons name="arrow-back" size={24} color="#fff"/>
      </TouchableOpacity>
      <View style={styles.headerInfo}>
        <Text style={styles.headerTitle}>{cropName||i18n.t('crop_negotiation')}</Text>
        <Text style={styles.headerSubtitle}>
          {currentUserId === farmer_id 
            ? getFormattedUserName(retailer_id, retailerName, false)
            : getFormattedUserName(farmer_id, farmerName, true)
          }
        </Text>
      </View>
      <View style={styles.headerRight}>
        <TouchableOpacity 
          onPress={toggleMute} 
          style={styles.headerButton}
        >
          <Ionicons 
            name={mute?"volume-mute-outline":"volume-high-outline"} 
            size={22} 
            color="#fff"
          />
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderInputToolbar = props => (
    <InputToolbar
      {...props}
      containerStyle={styles.inputToolbar}
      primaryStyle={styles.inputToolbarPrimary}
      renderComposer={composerProps => (
        <Composer
          {...composerProps}
          placeholder={i18n.t("type_a_message")}
          textInputStyle={styles.composer}
          text={inputText}
          onTextChanged={setInputText}
        />
      )}
      renderActions={() => {
        // Only show mic button on web
        if (Platform.OS === "web") {
          return (
            <TouchableOpacity
              onPress={() => isRecording?stopSpeechToText():startSpeechToText()}
              style={[styles.micButton, isRecording&&{backgroundColor:'#ffebee'}]}
            >
              <Ionicons 
                name={isRecording?"mic":"mic-outline"} 
                size={24} 
                color={isRecording?"red":"#4CAF50"}
              />
            </TouchableOpacity>
          );
        }
        return null;
      }}
      renderSend={sendProps => (
        <Send
          {...sendProps}
          containerStyle={styles.sendButton}
          disabled={!sendProps.text || sendProps.text.trim().length === 0}
        >
          <Ionicons 
            name="send" 
            size={24} 
            color={sendProps.text && sendProps.text.trim().length > 0 ? "#4CAF50" : "#9E9E9E"}
          />
        </Send>
      )}
    />
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#2E7D32"/>
      <ImageBackground source={DEFAULT_BG} style={styles.background} resizeMode="cover">
        {renderChatHeader()}

        {/* Chat container with fixed height for messages */}
        <View style={styles.chatContainer}>
          <GiftedChat
            messages={messages}
            onSend={onSend}
            user={{ 
              _id: currentUserId, 
              name: currentUserId === farmer_id 
                ? getFormattedUserName(farmer_id, farmerName, true)
                : getFormattedUserName(retailer_id, retailerName, false)
            }}
            placeholder={i18n.t("type_a_message")}
            showUserAvatar={false}
            scrollToBottom
            renderUsernameOnMessage
            text={inputText}
            onInputTextChanged={setInputText}
            renderBubble={props => (
              <Bubble
                {...props}
                wrapperStyle={{
                  right: {
                    backgroundColor: '#4CAF50', 
                    borderRadius: 18, 
                    paddingVertical: 8, 
                    paddingHorizontal: 12
                  },
                  left: {
                    backgroundColor: '#E8F5E9', 
                    borderRadius: 18, 
                    paddingVertical: 8, 
                    paddingHorizontal: 12
                  }
                }}
                textStyle={{
                  right: {color: '#fff'},
                  left: {color: '#2E7D32'}
                }}
                onPress={() => speakMessage(props.currentMessage?.text || "", selectedLang)}
                renderTime={renderTime}
              />
            )}
            renderDay={props => 
              <Day 
                {...props} 
                textStyle={styles.dayText} 
                containerStyle={styles.dayContainer}
              />
            }
            renderInputToolbar={renderInputToolbar}
            // Set to true to show latest messages at the bottom
            inverted={true}
            messagesContainerStyle={styles.messagesContainer}
            alwaysShowSend={false}
            // Ensure only messages scroll
            keyboardShouldPersistTaps="handled"
            // Prevent the entire chat from scrolling
            scrollEnabled={true}
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
  background: {
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#4CAF50',
    fontWeight: '500',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    padding: 20,
  },
  errorText: {
    color: '#F44336',
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 25,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4CAF50',
    paddingTop: 40,
    paddingBottom: 15,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#388E3C',
  },
  headerInfo: {
    flex: 1,
    marginLeft: 15,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    color: '#E8F5E9',
    fontSize: 14,
    marginTop: 2,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: 'flex-end',
  },
  headerButton: {
    padding: 4,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  messagesContainer: {
    backgroundColor: 'transparent',
    // Fixed height for messages area
    flex: 1,
    // Add padding at the bottom to prevent messages from being hidden behind input
    paddingBottom: 10,
  },
  inputToolbar: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    paddingTop: 8,
    paddingBottom: 6,
    paddingHorizontal: 10,
    borderRadius: 25,
    marginHorizontal: 10,
    marginBottom: 10,
    elevation: 3,
  },
  inputToolbarPrimary: {
    alignItems: 'center',
  },
  composer: {
    backgroundColor: '#F1F8E9',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#C5E1A5',
    paddingHorizontal: 15,
    fontSize: 16,
    color: '#33691E',
    paddingTop: 8,
    paddingBottom: 8,
    minHeight: 40,
    maxHeight: 100,
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
  dayContainer: {
    marginTop: 10,
    marginBottom: 5,
    alignItems: 'center',
  },
  dayText: {
    backgroundColor: 'rgba(76, 175, 80, 0.2)',
    color: '#2E7D32',
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    overflow: 'hidden',
  },
});