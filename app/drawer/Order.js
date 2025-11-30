import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next"; // Import i18n hook
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  FlatList,
  Image,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../supabase/supabaseClient";

/** ============================
 *   Progress Bar Component
 *  ============================ */
function ProgressBar({ status }) {
  const { t } = useTranslation(); // Initialize translation hook
  const stages = ["ordered", "packed", "shipped", "delivered"];
  const activeIndex = stages.indexOf(status);

  // Animation for line fill
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: activeIndex / (stages.length - 1),
      duration: 800,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [activeIndex]);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <View style={styles.progressBarContainer}>
      {/* Track + Fill */}
      <View style={styles.progressTrackWrapper}>
        <View style={styles.progressTrack} />
        <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
      </View>

      {/* Stage Dots + Labels */}
      <View style={styles.progressStages}>
        {stages.map((stage, idx) => {
          const isActive = idx <= activeIndex;
          const isCompleted =
            idx < activeIndex || (idx === activeIndex && status === "delivered");

          return (
            <View key={stage} style={styles.progressStage}>
              <View
                style={[
                  styles.stageDot,
                  isActive ? styles.stageActive : styles.stageInactive,
                ]}
              >
                {isCompleted && <Text style={styles.tick}>✓</Text>}
              </View>
              <Text
                style={[
                  styles.stageLabel,
                  isActive && styles.stageLabelActive,
                ]}
              >
                {t(stage)} {/* Translate stage name */}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** ============================
 *   Main Component
 *  ============================ */
export default function OrderProgressScreen() {
  const { t } = useTranslation(); // Initialize translation hook
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState([]);
  const [retailerName, setRetailerName] = useState("");
  const intervalRef = useRef(null);

  /** Fetch Orders + Retailer Name */
  useEffect(() => {
    let mounted = true;
    async function fetchData() {
      try {
        setLoading(true);
        const retailerId = await AsyncStorage.getItem("userId");
        if (!retailerId) return;

        // Retailer name
        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("name")
          .eq("id", retailerId)
          .single();
        if (profileError) throw profileError;
        if (mounted && profileData?.name) setRetailerName(profileData.name);

        // Orders
        const { data: ordersData, error: ordersError } = await supabase
          .from("orders")
          .select("*")
          .eq("retailer_id", retailerId)
          .order("created_at", { ascending: false });
        if (ordersError) throw ordersError;

        // Order items
        const enrichedOrders = await Promise.all(
          (ordersData || []).map(async (order) => {
            const { data: itemsData, error: itemsError } = await supabase
              .from("order_items")
              .select("*, produce:crop_id(*)")
              .eq("order_id", order.id);
            if (itemsError) throw itemsError;
            return { ...order, items: itemsData || [] };
          })
        );

        if (mounted) setOrders(enrichedOrders);
      } catch (err) {
        console.error("❌ fetchData error:", err.message);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    fetchData();

    return () => {
      mounted = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  /** Auto update order statuses every 10 seconds */
  useEffect(() => {
    const STATUS_SEQUENCE = ["ordered", "packed", "shipped", "delivered"];
    intervalRef.current = setInterval(async () => {
      try {
        for (const order of orders) {
          if (order.status === "delivered") continue;

          const currentIndex = STATUS_SEQUENCE.indexOf(order.status);
          if (currentIndex < STATUS_SEQUENCE.length - 1) {
            const newStatus = STATUS_SEQUENCE[currentIndex + 1];

            // Update in Supabase
            await supabase
              .from("orders")
              .update({ status: newStatus, updated_at: new Date() })
              .eq("id", order.id);

            // Update local
            setOrders((prev) =>
              prev.map((o) =>
                o.id === order.id ? { ...o, status: newStatus } : o
              )
            );
          }
        }
      } catch (err) {
        console.error("❌ Status update failed:", err.message);
      }
    }, 10000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [orders]);

  /** Format Date */
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return `${date.toDateString()} ${date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  };

  /** Gradient colors per status */
  const getGradientColors = (status) => {
    switch (status) {
      case "ordered":
        return ["#E3F2FD", "#BBDEFB"];
      case "packed":
        return ["#E8EAF6", "#C5CAE9"];
      case "shipped":
        return ["#E1F5FE", "#B3E5FC"];
      case "delivered":
        return ["#E0F7FA", "#B2EBF2"];
      default:
        return ["#f5f5f5", "#eeeeee"];
    }
  };

  /** Manual status update */
  const handleUpdateStatus = async (orderId) => {
    const STATUS_SEQUENCE = ["ordered", "packed", "shipped", "delivered"];
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;

    const currentIndex = STATUS_SEQUENCE.indexOf(order.status);
    if (currentIndex >= STATUS_SEQUENCE.length - 1) {
      Alert.alert(t('info'), t('orderAlreadyDelivered'));
      return;
    }

    const newStatus = STATUS_SEQUENCE[currentIndex + 1];

    try {
      await supabase
        .from("orders")
        .update({ status: newStatus, updated_at: new Date() })
        .eq("id", orderId);

      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o))
      );

      Alert.alert(t('success'), t('orderUpdatedTo', { status: t(newStatus) }));
    } catch (err) {
      console.error("❌ Manual status update failed:", err.message);
      Alert.alert(t('error'), t('failedToUpdateStatus'));
    }
  };

  /** Loading screen */
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4A6FA5" />
        <Text style={styles.loadingText}>{t('loadingOrders')}</Text>
      </View>
    );
  }

  /** Render Orders */
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#4A6FA5" />

      {/* Header */}
      <LinearGradient colors={["#4A6FA5", "#2C4C7C"]} style={styles.header}>
        <Text style={styles.headerTitle}>
          {retailerName ? t('retailerOrders', { retailerName }) : t('yourOrders')}
        </Text>
      </LinearGradient>

      {/* Orders */}
      <FlatList
        data={orders}
        keyExtractor={(order) => order.id}
        contentContainerStyle={styles.listContainer}
        renderItem={({ item }) => (
          <LinearGradient
            colors={getGradientColors(item.status)}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              styles.orderCard,
              item.status === "delivered" && styles.deliveredCard,
            ]}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.orderId}>{t('orderNumber', { id: item.id })}</Text>
              <Text style={styles.statusText}>{t(item.status).toUpperCase()}</Text>
            </View>
            <Text style={styles.orderTime}>📅 {formatDate(item.created_at)}</Text>

            {/* Items */}
            {item.items.map((it) => (
              <View key={it.id} style={styles.itemRow}>
                {it.produce?.image_url ? (
                  <Image source={{ uri: it.produce.image_url }} style={styles.thumb} />
                ) : (
                  <View style={[styles.thumb, { backgroundColor: "#BBDEFB" }]} />
                )}
                <View style={styles.itemDetails}>
                  <Text style={styles.cropName}>{it.produce?.crop_name}</Text>
                  <Text style={styles.detailText}>{t('quantity', { qty: it.quantity })}</Text>
                  <Text style={styles.detailText}>
                    {t('price', { price: it.price_per_kg })}
                  </Text>
                </View>
              </View>
            ))}

            {/* Progress Bar + Button */}
            <View style={styles.progressSection}>
              <ProgressBar status={item.status} />
              <TouchableOpacity
                style={[
                  styles.updateButton,
                  item.status === "delivered"
                    ? styles.deliveredButton
                    : styles.activeButton,
                ]}
                onPress={() => handleUpdateStatus(item.id)}
                disabled={item.status === "delivered"}
              >
                <Text style={styles.updateButtonText}>
                  {item.status === "delivered" ? t('delivered') : t('updateStatus')}
                </Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>{t('noOrdersFound')}</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

/** ============================
 *   Styles
 *  ============================ */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F7FA" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 10, fontSize: 16, color: "#4A6FA5" },

  header: {
    padding: 16,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  headerTitle: { fontSize: 24, fontWeight: "bold", color: "#fff", textAlign: "center" },

  listContainer: { padding: 16, paddingBottom: 80 },

  orderCard: {
    borderRadius: 20,
    padding: 18,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
  deliveredCard: { borderWidth: 2, borderColor: "#4CAF50" },

  cardHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  orderId: { fontSize: 18, fontWeight: "bold", color: "#2C4C7C" },
  statusText: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#fff",
    backgroundColor: "#4A6FA5",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  orderTime: { fontSize: 14, color: "#4A6FA5", marginBottom: 12 },

  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.8)",
  },
  thumb: { width: 70, height: 70, borderRadius: 10, marginRight: 12 },
  itemDetails: { flex: 1 },
  cropName: { fontSize: 16, fontWeight: "600", color: "#2C4C7C" },
  detailText: { fontSize: 14, color: "#555" },

  // Progress Bar
  progressSection: { marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#eee" },
  progressBarContainer: { marginBottom: 16 },
  progressTrackWrapper: { position: "absolute", top: 12, left: 0, right: 0, height: 4 },
  progressTrack: { flex: 1, backgroundColor: "#D3DCE6", borderRadius: 2 },
  progressFill: { position: "absolute", left: 0, height: 4, backgroundColor: "#2C4C7C" },
  progressStages: { flexDirection: "row", justifyContent: "space-between" },
  progressStage: { alignItems: "center", flex: 1 },
  stageDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#2C4C7C",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  stageActive: { backgroundColor: "#2C4C7C" },
  stageInactive: { backgroundColor: "#fff" },
  tick: { color: "#fff", fontSize: 14, fontWeight: "bold" },
  stageLabel: { marginTop: 6, fontSize: 10, color: "#888" },
  stageLabelActive: { color: "#2C4C7C", fontWeight: "bold" },

  updateButton: {
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
  },
  activeButton: { backgroundColor: "#4A6FA5" },
  deliveredButton: { backgroundColor: "#4CAF50" },
  updateButtonText: { color: "#fff", fontSize: 14, fontWeight: "600" },

  emptyContainer: { alignItems: "center", padding: 40 },
  emptyText: { fontSize: 18, color: "#4A6FA5" },
});