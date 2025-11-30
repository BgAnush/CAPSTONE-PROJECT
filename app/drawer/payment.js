import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNavigation, useRoute } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  Picker,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import "../languages/i18n";
import { supabase } from "../supabase/supabaseClient";

// Helper to show alerts
const showAlert = (title, message, onOk) => {
  Alert.alert(title, message, [{ text: "OK", onPress: onOk }]);
};

const generateTransactionId = () =>
  "TXN" + Math.floor(Math.random() * 1000000000);

export default function Payment() {
  const { t, ready, i18n } = useTranslation();
  const route = useRoute();
  const navigation = useNavigation();
  const { cartItems, totalAmount } = route.params || {};

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("Card");
  const [isLanguageLoaded, setIsLanguageLoaded] = useState(false);

  useEffect(() => {
    const loadLanguage = async () => {
      try {
        const storedLanguage = await AsyncStorage.getItem("selectedLanguage");
        if (storedLanguage) {
          await i18n.changeLanguage(storedLanguage);
        }
      } catch (error) {
        console.error("Error loading language:", error);
      } finally {
        setIsLanguageLoaded(true);
      }
    };
    loadLanguage();
  }, [i18n]);

  if (!ready || !isLanguageLoaded) {
    return (
      <LinearGradient
        colors={["#A5D6A7", "#81C784", "#4CAF50"]}
        style={styles.fullScreen}
      >
        <ActivityIndicator size="large" color="#fff" />
      </LinearGradient>
    );
  }

  const handlePayment = async () => {
    if (!cartItems || cartItems.length === 0) {
      showAlert(
        t("payment.errors.cartEmpty"),
        t("payment.errors.noItemsToPay")
      );
      return;
    }

    setLoading(true);
    try {
      const retailerId = await AsyncStorage.getItem("userId");
      if (!retailerId) throw new Error("User not logged in");
      if (!totalAmount || isNaN(totalAmount)) {
        throw new Error("Invalid total amount");
      }

      // Order creation
      const { data: orderData, error: orderError } = await supabase
        .from("orders")
        .insert({
          retailer_id: retailerId,
          total_amount: parseFloat(totalAmount),
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (orderError) throw new Error(`Order creation failed: ${orderError.message}`);
      const orderId = orderData?.id;

      // Insert order items
      const orderItems = cartItems.map((item) => ({
        order_id: orderId,
        crop_id: item.crop_id,
        quantity: item.quantity,
        price_per_kg: item.price_per_kg,
        total_price: item.quantity * item.price_per_kg,
      }));

      const { error: orderItemsError } = await supabase
        .from("order_items")
        .insert(orderItems);

      if (orderItemsError)
        throw new Error(`Order items failed: ${orderItemsError.message}`);

      // Payment
      const paymentStatus = paymentMethod === "COD" ? "pending" : "success";
      const { error: paymentError } = await supabase
        .from("payments")
        .insert({
          order_id: orderId,
          retailer_id: retailerId,
          amount: parseFloat(totalAmount),
          payment_method: paymentMethod,
          status: paymentStatus,
          transaction_id: generateTransactionId(),
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (paymentError)
        throw new Error(`Payment failed: ${paymentError.message}`);

      // Clear cart
      await supabase.from("cart").delete().eq("retailer_id", retailerId);

      setSuccess(true);
    } catch (err) {
      console.error("Payment error:", err);
      showAlert(
        t("payment.errors.paymentFailed"),
        err.message || t("payment.errors.defaultError")
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient
      colors={["#A5D6A7", "#81C784", "#4CAF50"]}
      style={styles.fullScreen}
    >
      <View style={styles.card}>
        {!success ? (
          <>
            {/* Header with icon */}
            <View style={styles.headerContainer}>
              <Text style={styles.heading}>{t("payment.title")}</Text>
            </View>
            
            {/* Total amount display with accent */}
            <View style={styles.totalContainer}>
              <Text style={styles.total}>
                {t("payment.totalAmount", { amount: totalAmount })}
              </Text>
            </View>

            {/* Payment method selection with icons */}
            <Text style={styles.label}>{t("payment.selectMethod")}</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={paymentMethod}
                onValueChange={(value) => setPaymentMethod(value)}
                style={styles.picker}
              >
                <Picker.Item 
                  label={t("payment.methods.upi")} 
                  value="UPI" 
                  color="#4CAF50"
                />
                <Picker.Item 
                  label={t("payment.methods.card")} 
                  value="Card" 
                  color="#4CAF50"
                />
                <Picker.Item 
                  label={t("payment.methods.cod")} 
                  value="COD" 
                  color="#4CAF50"
                />
              </Picker>
            </View>

            {/* Payment button with gradient */}
            <TouchableOpacity
              style={styles.payBtn}
              onPress={handlePayment}
              disabled={loading}
            >
              <LinearGradient
                colors={["#388E3C", "#2E7D32"]}
                style={styles.payBtnGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.payText}>{t("payment.payNow")}</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </>
        ) : (
          // Success state with celebration
          <View style={styles.successContainer}>
            <View style={styles.successIconContainer}>
              <Text style={styles.successIcon}>✓</Text>
            </View>
            <Text style={styles.successText}>
              {t("payment.success.title")}
            </Text>
            <Text style={styles.successSub}>
              {t("payment.success.message")}
            </Text>
            
            {/* Order details */}
            <View style={styles.orderDetails}>
              <Text style={styles.orderDetailLabel}>
                {t("payment.orderNumber")}: {generateTransactionId()}
              </Text>
              <Text style={styles.orderDetailLabel}>
                {t("payment.amountPaid")}: ₹{totalAmount}
              </Text>
              <Text style={styles.orderDetailLabel}>
                {t("payment.paymentMethod")}: {paymentMethod}
              </Text>
            </View>
            
            <TouchableOpacity
              style={styles.homeBtn}
              onPress={() => navigation.navigate("(tabs)/retailerDashboard")}
            >
              <LinearGradient
                colors={["#1976D2", "#1565C0"]}
                style={styles.homeBtnGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Text style={styles.homeText}>
                  {t("payment.success.goToHome")}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fullScreen: { 
    flex: 1, 
    justifyContent: "center", 
    alignItems: "center" 
  },
  card: {
    width: "90%",
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 24,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
    alignItems: "center",
  },
  headerContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  headerIcon: {
    fontSize: 24,
  },
  heading: { 
    fontSize: 28, 
    fontWeight: "700", 
    color: "#1B5E20",
    letterSpacing: 0.5,
  },
  totalContainer: {
    backgroundColor: "#F1F8E9",
    borderRadius: 12,
    padding: 16,
    width: "100%",
    alignItems: "center",
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#C8E6C9",
  },
  totalLabel: {
    fontSize: 14,
    color: "#558B2F",
    marginBottom: 4,
    fontWeight: "500",
  },
  total: { 
    fontSize: 26, 
    fontWeight: "700", 
    color: "#33691E",
  },
  label: { 
    fontSize: 16, 
    fontWeight: "600", 
    marginBottom: 12, 
    color: "#333",
    alignSelf: "flex-start",
    marginLeft: 4,
  },
  pickerContainer: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#C8E6C9",
    borderRadius: 12,
    marginBottom: 24,
    backgroundColor: "#FAFAFA",
    overflow: "hidden",
  },
  picker: { 
    height: 56, 
    width: "100%",
    paddingHorizontal: 12,
  },
  payBtn: {
    width: "100%",
    borderRadius: 12,
    overflow: "hidden",
    elevation: 4,
    marginBottom: 16,
  },
  payBtnGradient: {
    paddingVertical: 16,
    alignItems: "center",
  },
  payText: { 
    color: "#fff", 
    fontSize: 18, 
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  securityNote: {
    fontSize: 12,
    color: "#757575",
    marginTop: 8,
    textAlign: "center",
  },
  successContainer: { 
    justifyContent: "center", 
    alignItems: "center",
    width: "100%",
  },
  successIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#E8F5E9",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  successIcon: {
    fontSize: 40,
    color: "#2E7D32",
    fontWeight: "bold",
  },
  successText: { 
    fontSize: 26, 
    fontWeight: "700", 
    color: "#2E7D32", 
    marginBottom: 8,
    textAlign: "center",
  },
  successSub: { 
    fontSize: 16, 
    color: "#555", 
    marginBottom: 24, 
    textAlign: "center", 
    lineHeight: 22,
  },
  orderDetails: {
    backgroundColor: "#F5F5F5",
    borderRadius: 12,
    padding: 16,
    width: "100%",
    marginBottom: 24,
  },
  orderDetailLabel: {
    fontSize: 14,
    color: "#424242",
    marginBottom: 6,
    fontWeight: "500",
  },
  homeBtn: {
    width: "80%",
    borderRadius: 12,
    overflow: "hidden",
    elevation: 4,
  },
  homeBtnGradient: {
    paddingVertical: 14,
    alignItems: "center",
  },
  homeText: { 
    color: "#fff", 
    fontWeight: "600", 
    fontSize: 16,
    letterSpacing: 0.5,
  },
});