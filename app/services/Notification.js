import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next"; // Import i18n hook
import {
  Alert,
  FlatList,
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../supabase/supabaseClient";

const Notification = () => {
  const { t } = useTranslation(); // Initialize translation hook
  const navigation = useNavigation();
  const [notifications, setNotifications] = useState([]);

  // Fetch notifications from database
  const fetchNotifications = async () => {
    try {
      const userId = await AsyncStorage.getItem("userId");
      if (!userId) return;

      // Get notifications for current user
      const { data: notifs, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Format notifications with additional data
      const formatted = await Promise.all(
        notifs.map(async (notif) => {
          let crop_name = t('unknownCrop'); // Default crop name

          // For message notifications, get crop name from conversation
          if (notif.type === "message" && notif.related_id) {
            const { data: msg } = await supabase
              .from("messages")
              .select("*")
              .eq("id", notif.related_id)
              .single();
            if (!msg) return { ...notif, crop_name };

            const { data: conv } = await supabase
              .from("conversations")
              .select("*")
              .eq("id", msg.conversation_id)
              .single();
            if (!conv) return { ...notif, crop_name };

            const { data: prod } = await supabase
              .from("produce")
              .select("crop_name")
              .eq("id", conv.crop_id)
              .single();
            if (prod?.crop_name) crop_name = prod.crop_name;
          }

          // For order notifications, get crop name from order items
          if (notif.type === "order" && notif.related_id) {
            const { data: orderItems } = await supabase
              .from("order_items")
              .select("crop_id")
              .eq("order_id", notif.related_id)
              .limit(1);
            if (orderItems?.length > 0) {
              const { data: prod } = await supabase
                .from("produce")
                .select("crop_name")
                .eq("id", orderItems[0].crop_id)
                .single();
              if (prod?.crop_name) crop_name = prod.crop_name;
            }
          }

          return { ...notif, crop_name };
        })
      );

      setNotifications(formatted);
    } catch (err) {
      console.error("Error fetching notifications:", err);
    }
  };

  useEffect(() => {
    fetchNotifications(); // Load notifications when component mounts
  }, []);

  // Handle notification press
  const handlePress = (item) => {
    if (item.type === "order") navigation.navigate("drawer/Order");
    else if (item.type === "message") Alert.alert(t('message'), item.message_content || item.body);
  };

  // Remove notification
  const removeNotification = async (id) => {
    try {
      await supabase.from("notifications").delete().eq("id", id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } catch (err) {
      console.error(err);
    }
  };

  // Common Header with Safe Back
  const CustomHeader = ({ title }) => (
    <LinearGradient
      colors={["#6a11cb", "#2575fc"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.header}
    >
      <TouchableOpacity
        onPress={() => {
          if (navigation.canGoBack()) {
            navigation.goBack();
          } else {
            navigation.navigate("FarmerDashboard"); // fallback
          }
        }}
        style={styles.backButton}
      >
        <Ionicons name="arrow-back" size={24} color="#fff" />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={{ width: 40 }} />
    </LinearGradient>
  );

  // Render individual notification item
  const renderItem = ({ item }) => (
    <View style={styles.cardContainer}>
      <LinearGradient
        colors={
          item.type === "order"
            ? ["#4CAF50", "#388E3C"]
            : ["#2196F3", "#1976D2"]
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.cardHeader}
      >
        <View style={styles.headerContent}>
          <View style={styles.iconContainer}>
            <Ionicons
              name={item.type === "order" ? "cart-outline" : "mail-outline"}
              size={20}
              color="#fff"
            />
          </View>
          <Text style={styles.cardTitle}>{item.title}</Text>
        </View>
        <TouchableOpacity onPress={() => removeNotification(item.id)}>
          <Ionicons name="close-circle" size={22} color="#fff" />
        </TouchableOpacity>
      </LinearGradient>

      <TouchableOpacity
        style={styles.cardBody}
        onPress={() => handlePress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.cropInfo}>
          <Ionicons name="leaf-outline" size={16} color="#4CAF50" />
          <Text style={styles.cropNameText}>{item.crop_name}</Text>
        </View>

        {item.type === "message" && item.message_content && (
          <Text style={styles.messageText}>{item.message_content}</Text>
        )}

        <View style={styles.dateContainer}>
          <Ionicons name="time-outline" size={14} color="#999" />
          <Text style={styles.dateText}>
            {new Date(item.created_at).toLocaleString()}
          </Text>
        </View>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#6a11cb" />
      <CustomHeader title={t('notifications')} />
      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="notifications-off-outline" size={60} color="#ccc" />
            <Text style={styles.emptyText}>{t('noNotifications')}</Text>
            <Text style={styles.emptySubtext}>
              {t('noNotificationsSubtext')}
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    justifyContent: "space-between",
    elevation: 6,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  listContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  cardContainer: {
    marginBottom: 20,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  cardHeader: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  cardTitle: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
    letterSpacing: 0.3,
  },
  cardBody: {
    padding: 16,
    backgroundColor: "#fff",
  },
  cropInfo: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  cropNameText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#2E7D32",
    marginLeft: 6,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
    color: "#333",
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  dateContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#F0F0F0",
  },
  dateText: {
    fontSize: 13,
    color: "#999",
    marginLeft: 6,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#666",
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#999",
    textAlign: "center",
    lineHeight: 20,
  },
});

export default Notification;