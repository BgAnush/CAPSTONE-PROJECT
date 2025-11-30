// ConversationList.js
import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNavigation } from "@react-navigation/native";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import '../languages/i18n'; // Import i18n configuration
import { supabase } from "../supabase/supabaseClient";

const PLACEHOLDER = "https://via.placeholder.com/60x60.png?text=No+Image";
const REFRESH_INTERVAL = 30000; // 30 seconds

export default function ConversationList() {
  const navigation = useNavigation();
  const { t, i18n } = useTranslation();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [isLanguageReady, setIsLanguageReady] = useState(false);
  const intervalRef = useRef(null);

  // Initialize language from AsyncStorage
  useEffect(() => {
    const initializeLanguage = async () => {
      try {
        const savedLanguage = await AsyncStorage.getItem('selectedLanguage');
        
        if (savedLanguage) {
          await i18n.changeLanguage(savedLanguage);
        }
      } catch (error) {
        console.error('Error loading language preference:', error);
      } finally {
        setIsLanguageReady(true);
      }
    };
    
    initializeLanguage();
  }, [i18n]);

  // Fetch user ID and start periodic refresh
  useEffect(() => {
    if (!isLanguageReady) return;

    const getUserId = async () => {
      try {
        const id = await AsyncStorage.getItem("userId");
        if (id) {
          setUserId(id);
          fetchConversations(id);

          // Set up periodic refresh every 30 seconds
          intervalRef.current = setInterval(() => {
            fetchConversations(id, true);
          }, REFRESH_INTERVAL);
        }
      } catch (err) {
        console.error("getUserId error:", err);
        setError(t('conversations.error.fetchUserIdFailed'));
        setLoading(false);
      }
    };

    getUserId();

    // Clean up interval on unmount
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isLanguageReady, t]);

  // Fetch conversations and unread messages
  const fetchConversations = async (farmerId, isBackgroundRefresh = false) => {
    try {
      if (!isBackgroundRefresh) {
        setLoading(true);
        setError("");
      }

      // First get all conversations for this farmer
      const { data: conversationsData, error: conversationsError } = await supabase
        .from("conversations")
        .select(`
          id,
          crop_id,
          retailer_id,
          created_at,
          crop:crop_id (crop_name, image_url),
          retailer:retailer_id (name)
        `)
        .eq("farmer_id", farmerId)
        .order("created_at", { ascending: true });

      if (conversationsError) throw conversationsError;
      if (!conversationsData || conversationsData.length === 0) {
        setConversations([]);
        if (!isBackgroundRefresh) setLoading(false);
        return;
      }

      // Get conversation IDs for the next query
      const conversationIds = conversationsData.map((conv) => conv.id);

      // Get the last message for each conversation
      const { data: lastMessages, error: lastMessagesError } = await supabase
        .from("messages")
        .select("conversation_id, content, created_at")
        .in("conversation_id", conversationIds)
        .order("created_at", { ascending: false });

      if (lastMessagesError) throw lastMessagesError;

      // Create a map of conversation_id to last message
      const lastMessageMap = {};
      if (lastMessages) {
        lastMessages.forEach((msg) => {
          if (!lastMessageMap[msg.conversation_id]) {
            lastMessageMap[msg.conversation_id] = {
              content: msg.content,
              created_at: msg.created_at
            };
          }
        });
      }

      // Fetch unread messages
      const { data: unreadMessages, error: unreadError } = await supabase
        .from("messages")
        .select("conversation_id")
        .in("conversation_id", conversationIds)
        .neq("sender_id", farmerId)
        .is("read_at", null);

      if (unreadError) throw unreadError;

      const unreadConversationIds = new Set();
      unreadMessages.forEach((msg) => unreadConversationIds.add(msg.conversation_id));

      // Format conversations with last message data
      const formattedConversations = conversationsData.map((conv) => {
        const lastMessage = lastMessageMap[conv.id];
        
        return {
          id: conv.id,
          cropId: conv.crop_id,
          retailerId: conv.retailer_id,
          cropName: conv.crop?.crop_name || t('conversations.unknownCrop'),
          cropImage: conv.crop?.image_url || PLACEHOLDER,
          retailerName: conv.retailer?.name || t('conversations.unknownRetailer'),
          lastMessage: lastMessage?.content || t('conversations.noMessagesYet'),
          lastMessageAt: lastMessage?.created_at || conv.created_at,
          hasUnread: unreadConversationIds.has(conv.id),
        };
      });

      // Sort by last message time (most recent first)
      formattedConversations.sort((a, b) => 
        new Date(b.lastMessageAt) - new Date(a.lastMessageAt)
      );

      setConversations(formattedConversations);
      setLastRefresh(new Date());
    } catch (err) {
      console.error("Fetch conversations error:", err);
      if (!isBackgroundRefresh) setError(err.message || t('conversations.error.fetchFailed'));
    } finally {
      if (!isBackgroundRefresh) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  // Handle manual refresh
  const onRefresh = async () => {
    setRefreshing(true);
    if (userId) await fetchConversations(userId);
  };

  // Navigate to conversation chat screen
  const handleConversationPress = (conversation) => {
    navigation.navigate("drawer/NegotiationChatF", {
      conversationId: conversation.id,
      cropId: conversation.cropId,
      retailerId: conversation.retailerId,
      cropName: conversation.cropName,
      retailerName: conversation.retailerName,
    });
  };

  // Format timestamp to readable time
  const formatTime = (timestamp) => {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = (now - date) / (1000 * 60 * 60);

    if (diffInHours < 24) return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (diffInHours < 48) return t('conversations.yesterday');
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  // Render individual conversation item
  const renderConversationItem = ({ item }) => (
    <TouchableOpacity
      style={[styles.conversationCard, item.hasUnread && styles.unreadCard]}
      onPress={() => handleConversationPress(item)}
      activeOpacity={0.7}
    >
      <View style={styles.imageContainer}>
        <Image source={{ uri: item.cropImage }} style={styles.cropImage} />
        {item.hasUnread && <View style={styles.unreadDot} />}
      </View>
      <View style={styles.conversationInfo}>
        <View style={styles.conversationHeader}>
          <Text style={styles.cropName} numberOfLines={1}>
            {item.cropName}
          </Text>
          <Text style={[styles.timeText, item.hasUnread && styles.unreadTimeText]}>
            {formatTime(item.lastMessageAt)}
          </Text>
        </View>
        <View style={styles.conversationDetails}>
          <Text style={styles.retailerName} numberOfLines={1}>
            {item.retailerName}
          </Text>
          <Text style={[styles.lastMessage, item.hasUnread && styles.unreadMessage]} numberOfLines={1}>
            {item.lastMessage}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  // Render empty state when no conversations exist
  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconContainer}>
        <Feather name="message-square" size={48} color="#25D366" />
      </View>
      <Text style={styles.emptyText}>{t('conversations.empty.title')}</Text>
      <Text style={styles.emptySubtext}>
        {t('conversations.empty.description')}
      </Text>
      <TouchableOpacity 
        style={styles.startButton} 
        onPress={() => navigation.navigate("(tabs)/farmerDashboard")}
      >
        <Text style={styles.startButtonText}>{t('conversations.empty.browseCrops')}</Text>
      </TouchableOpacity>
    </View>
  );

  // Render error state
  const renderErrorState = () => (
    <View style={styles.emptyState}>
      <View style={styles.errorIconContainer}>
        <Feather name="alert-circle" size={48} color="#E53935" />
      </View>
      <Text style={styles.errorText}>{error}</Text>
      <TouchableOpacity style={styles.retryButton} onPress={onRefresh}>
        <Text style={styles.retryButtonText}>{t('conversations.retry')}</Text>
      </TouchableOpacity>
    </View>
  );

  // Show loading state until language is ready
  if (!isLanguageReady) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#128C7E" />
        <Text style={styles.loadingText}>{t('common.loading')}</Text>
      </View>
    );
  }

  // Main component render
  return (
    <View style={styles.container}>
      {/* Header with back button, title, and refresh button */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.navigate("(tabs)/farmerDashboard")}
          style={styles.backButton}
        >
          <Feather name="arrow-left" size={24} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('conversations.title')}</Text>
        <TouchableOpacity onPress={onRefresh} disabled={refreshing}>
          <Feather
            name="refresh-ccw"
            size={20}
            color="white"
            style={refreshing ? { opacity: 0.5 } : {}}
          />
        </TouchableOpacity>
      </View>

      {/* Last refresh time indicator */}
      <View style={styles.refreshInfo}>
        <Text style={styles.refreshText}>
          {t('conversations.lastUpdated')}: {lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>

      {/* Main content area */}
      {error ? (
        renderErrorState()
      ) : conversations.length === 0 ? (
        renderEmptyState()
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderConversationItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={["#128C7E"]}
              tintColor="#128C7E"
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ECE5DD" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    paddingTop: 24,
    backgroundColor: "#25D366",
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  backButton: { padding: 8, borderRadius: 20, backgroundColor: 'rgba(255, 255, 255, 0.2)' },
  headerTitle: { fontSize: 22, fontWeight: "700", color: "white", letterSpacing: 0.5 },
  refreshInfo: { paddingVertical: 8, paddingHorizontal: 16, backgroundColor: 'rgba(0,0,0,0.05)', alignItems: 'center' },
  refreshText: { fontSize: 12, color: '#8696A0', fontStyle: 'italic' },
  listContent: { padding: 16, paddingTop: 8 },
  conversationCard: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    padding: 16,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    elevation: 1,
  },
  unreadCard: { backgroundColor: "#F8F9FA", borderLeftWidth: 4, borderLeftColor: "#25D366" },
  imageContainer: { position: 'relative', marginRight: 16 },
  cropImage: { width: 56, height: 56, borderRadius: 28, backgroundColor: "#F0F0F0" },
  unreadDot: { position: 'absolute', top: 0, right: 0, width: 16, height: 16, borderRadius: 8, backgroundColor: '#25D366', borderWidth: 2, borderColor: '#FFFFFF' },
  conversationInfo: { flex: 1, justifyContent: 'space-between' },
  conversationHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  cropName: { fontSize: 16, fontWeight: "600", color: "#111B21", flex: 1, marginRight: 8 },
  timeText: { fontSize: 12, color: "#8696A0" },
  unreadTimeText: { color: "#128C7E", fontWeight: '600' },
  conversationDetails: { flexDirection: "column" },
  retailerName: { fontSize: 14, fontWeight: "500", color: "#128C7E", marginBottom: 4 },
  lastMessage: { fontSize: 14, color: "#3B4A54", lineHeight: 18 },
  unreadMessage: { fontWeight: '600', color: "#111B21" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 12, color: "#3B4A54", fontSize: 16 },
  emptyState: { flex: 1, justifyContent: "center", alignItems: "center", padding: 40, paddingTop: 60 },
  emptyIconContainer: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(37, 211, 102, 0.1)', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  emptyText: { marginTop: 8, fontSize: 18, fontWeight: "600", color: "#111B21", textAlign: "center" },
  emptySubtext: { marginTop: 8, fontSize: 14, color: "#8696A0", textAlign: "center", lineHeight: 20, marginBottom: 24 },
  startButton: { backgroundColor: '#25D366', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 30, shadowColor: '#25D366', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 3 },
  startButtonText: { color: 'white', fontWeight: '600', fontSize: 16 },
  errorIconContainer: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(229, 57, 53, 0.1)', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  errorText: { marginTop: 8, fontSize: 16, color: "#E53935", textAlign: "center", marginBottom: 16, lineHeight: 22 },
  retryButton: { backgroundColor: "#25D366", paddingVertical: 12, paddingHorizontal: 24, borderRadius: 30, shadowColor: '#25D366', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 3 },
  retryButtonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});