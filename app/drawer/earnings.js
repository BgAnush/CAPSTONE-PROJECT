import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { supabase } from "../supabase/supabaseClient";

export default function Earnings() {
  const { t } = useTranslation(); // Initialize translation hook
  const [earnings, setEarnings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchEarnings(); // Fetch earnings data when component mounts
  }, []);

  const fetchEarnings = async () => {
    try {
      setLoading(true);
      // Get farmer ID from AsyncStorage
      const farmerId = await AsyncStorage.getItem("userId");
      if (!farmerId) {
        setLoading(false);
        return;
      }

      // Fetch order items with related orders and produce data
      const { data, error } = await supabase
        .from('order_items')
        .select(`
          *,
          orders!inner(*),
          produce!inner(*)
        `)
        .eq('produce.farmer_id', farmerId)
        .order('created_at', { foreignTable: 'orders', ascending: false });

      if (error) {
        setLoading(false);
        return;
      }

      setEarnings(data || []); // Update earnings state
    } catch (err) {
      setLoading(false);
    } finally {
      setLoading(false);
    }
  };

  // Calculate earnings summary
  const calculateSummary = () => {
    if (earnings.length === 0) return { totalOrders: 0, totalEarnings: 0 };
    const uniqueOrderIds = new Set(earnings.map(item => item.order_id));
    const totalOrders = uniqueOrderIds.size;
    const totalEarnings = earnings.reduce((sum, item) => sum + parseFloat(item.total_price || 0), 0);
    return { totalOrders, totalEarnings };
  };

  const summary = calculateSummary();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#00aaff" />
        <Text style={{ marginTop: 10 }}>{t('loadingEarnings')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header with gradient background */}
      <LinearGradient
        colors={['#2d6a4f', '#52b788']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.header}
      >
        <Text style={styles.headerTitle}>{t('earnings')}</Text>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: 15 }}>
        {/* Summary Card */}
        <LinearGradient
          colors={['#40916c', '#95d5b2']}
          style={styles.summaryCard}
        >
          <Text style={styles.summaryTitle}>{t('earningsSummary')}</Text>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{summary.totalOrders}</Text>
              <Text style={styles.summaryLabel}>{t('totalOrders')}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>₹{summary.totalEarnings.toFixed(2)}</Text>
              <Text style={styles.summaryLabel}>{t('totalEarnings')}</Text>
            </View>
          </View>
        </LinearGradient>

        {earnings.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.noData}>{t('noEarningsFound')}</Text>
            <Text style={styles.noDataSubtitle}>{t('noEarningsSubtitle')}</Text>
          </View>
        ) : (
          earnings.map((item) => (
            <LinearGradient
              key={item.id}
              colors={['#ffffff', '#e6f0ef']}
              style={styles.card}
            >
              <View style={styles.cardRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.orderIdTop}>
                    {t('orderId', { id: item.order_id })}
                  </Text>
                  <Text style={styles.cropName}>
                    {item.produce?.crop_name || t('unknownCrop')}
                  </Text>
                  <Text style={styles.detail}>
                    {t('quantity', { quantity: item.quantity })}
                  </Text>
                  <Text style={styles.detail}>
                    {t('pricePerKg', { price: item.price_per_kg })}
                  </Text>
                  <Text style={styles.total}>
                    {t('total', { total: item.total_price })}
                  </Text>
                  <Text style={[
                    styles.status,
                    {
                      color: item.orders?.status === 'delivered' || 
                             item.orders?.status === 'completed' 
                             ? '#4CAF50' : '#ff6b6b'
                    }
                  ]}>
                    {t('status', { status: item.orders?.status || 'unknown' })}
                  </Text>
                  <Text style={styles.date}>
                    {t('lastUpdated', { 
                      date: item.orders?.updated_at 
                        ? new Date(item.orders.updated_at).toLocaleString() 
                        : t('unknownDate') 
                    })}
                  </Text>
                </View>
                {/* Crop Image */}
                {item.produce?.image_url && (
                  <Image
                    source={{ uri: item.produce.image_url }}
                    style={styles.cropImage}
                  />
                )}
              </View>
            </LinearGradient>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: "#e0f2f1" 
  },
  center: { 
    flex: 1, 
    justifyContent: "center", 
    alignItems: "center", 
    padding: 20 
  },
  header: {
    paddingVertical: 25,
    justifyContent: "center",
    alignItems: "center",
    borderBottomLeftRadius: 25,
    borderBottomRightRadius: 25,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  headerTitle: { 
    color: "#fff", 
    fontSize: 24, 
    fontWeight: "bold" 
  },
  noData: { 
    textAlign: "center", 
    marginTop: 20, 
    fontSize: 18, 
    fontWeight: "bold", 
    color: "#666" 
  },
  noDataSubtitle: { 
    textAlign: "center", 
    marginTop: 10, 
    fontSize: 14, 
    color: "#888" 
  },
  summaryCard: {
    padding: 20,
    marginBottom: 20,
    borderRadius: 15,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  summaryTitle: { 
    fontSize: 20, 
    fontWeight: "bold", 
    color: "#fff", 
    marginBottom: 15, 
    textAlign: "center" 
  },
  summaryRow: { 
    flexDirection: "row", 
    justifyContent: "space-around", 
    alignItems: "center" 
  },
  summaryItem: { 
    alignItems: "center", 
    flex: 1 
  },
  summaryValue: { 
    fontSize: 24, 
    fontWeight: "bold", 
    color: "#fff" 
  },
  summaryLabel: { 
    fontSize: 14, 
    color: "#e0f2e9", 
    marginTop: 5 
  },
  summaryDivider: { 
    width: 1, 
    height: 50, 
    backgroundColor: "rgba(255, 255, 255, 0.3)" 
  },
  card: {
    padding: 15,
    marginBottom: 15,
    borderRadius: 15,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardRow: { 
    flexDirection: "row", 
    justifyContent: "space-between", 
    alignItems: "center" 
  },
  orderIdTop: { 
    fontSize: 12, 
    color: "#999", 
    marginBottom: 5, 
    fontStyle: "italic" 
  },
  cropName: { 
    fontWeight: "bold", 
    fontSize: 18, 
    marginBottom: 6, 
    color: "#2d6a4f" 
  },
  detail: { 
    fontSize: 14, 
    marginBottom: 4, 
    color: "#444" 
  },
  total: { 
    fontSize: 15, 
    fontWeight: "600", 
    marginTop: 4, 
    color: "#333" 
  },
  status: { 
    fontSize: 14, 
    fontWeight: "600", 
    marginBottom: 4 
  },
  date: { 
    fontSize: 12, 
    color: "#777", 
    marginBottom: 2 
  },
  cropImage: { 
    width: 60, 
    height: 60, 
    borderRadius: 8, 
    marginLeft: 10 
  },
});