import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next"; // Import i18n hook
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../supabase/supabaseClient";

// Cart Item Component with local input state
const CartItem = ({ item, updateQuantity, removeItem, navigation }) => {
  const { t } = useTranslation(); // Initialize translation hook
  const [inputValue, setInputValue] = useState(String(item.quantity));
  const [isEditing, setIsEditing] = useState(false);

  // Update local input when item quantity changes
  useEffect(() => {
    if (!isEditing) {
      setInputValue(String(item.quantity));
    }
  }, [item.quantity, isEditing]);

  const handleTextChange = (text) => {
    setInputValue(text);
    setIsEditing(true);
  };

  const handleBlur = () => {
    setIsEditing(false);
    const newQty = parseInt(inputValue) || 0;
    if (newQty !== item.quantity) {
      updateQuantity(
        item.id,
        item.crop_id,
        item.price_per_kg,
        item.quantity,
        newQty,
        item.produce?.quantity
      );
    }
  };

  const handleSubmit = () => {
    setIsEditing(false);
    handleBlur();
  };

  return (
    <View style={styles.card}>
      <Image
        source={{
          uri: item.produce?.image_url || "https://via.placeholder.com/150",
        }}
        style={styles.image}
      />
      <View style={styles.info}>
        <Text style={styles.name}>{item.produce?.crop_name || t('unknownCrop')}</Text>
        <Text style={styles.price}>
          ₹{item.price_per_kg?.toFixed(2) || "0.00"} / kg
        </Text>
        
        {/* Quantity Selector */}
        <View style={styles.qtyRow}>
          <TouchableOpacity
            onPress={() => {
              const newQty = item.quantity - 1;
              setInputValue(String(newQty));
              updateQuantity(
                item.id,
                item.crop_id,
                item.price_per_kg,
                item.quantity,
                newQty,
                item.produce?.quantity
              );
            }}
            style={styles.qtyBtn}
          >
            <Text style={styles.qtyText}>-</Text>
          </TouchableOpacity>
          
          <TextInput
            style={styles.qtyInput}
            keyboardType="numeric"
            value={inputValue}
            onChangeText={handleTextChange}
            onBlur={handleBlur}
            onSubmitEditing={handleSubmit}
          />
          
          <TouchableOpacity
            onPress={() => {
              const newQty = item.quantity + 1;
              setInputValue(String(newQty));
              updateQuantity(
                item.id,
                item.crop_id,
                item.price_per_kg,
                item.quantity,
                newQty,
                item.produce?.quantity
              );
            }}
            style={styles.qtyBtn}
          >
            <Text style={styles.qtyText}>+</Text>
          </TouchableOpacity>
        </View>
        
        <Text style={styles.stock}>
          {t('stockAvailable', { stock: item.produce?.quantity ?? 0 })}
        </Text>
        <Text style={styles.itemTotal}>
          {t('itemTotal', { total: (item.total_price || 0).toFixed(2) })}
        </Text>
        
        {/* Negotiation */}
        <TouchableOpacity
          style={styles.negotiateBtn}
          onPress={async () => {
            const retailerId = await AsyncStorage.getItem("userId");
            navigation.navigate("drawer/NegotiationChat", {
              crop_id: item.crop_id,
              farmer_id: item.produce?.farmer_id,
              retailer_id: retailerId,
              currentUserId: retailerId,
            });
          }}
        >
          <Text style={styles.negotiateText}>{t('negotiate')}</Text>
        </TouchableOpacity>
      </View>
      
      <TouchableOpacity
        style={styles.removeBtn}
        onPress={() => removeItem(item.id, item.crop_id, item.quantity)}
      >
        <Text style={styles.removeText}>×</Text>
      </TouchableOpacity>
    </View>
  );
};

export default function AddToCart() {
  const { t } = useTranslation(); // Initialize translation hook
  const [cartItems, setCartItems] = useState([]);
  const [totalPrice, setTotalPrice] = useState("0.00");
  const [loading, setLoading] = useState(true);
  const navigation = useNavigation();

  // Load cart items
  useEffect(() => {
    fetchCartItems();
    const subscription = supabase
      .channel("cart_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cart" },
        fetchCartItems
      )
      .subscribe();
    return () => supabase.removeChannel(subscription);
  }, []);

  // Fetch items
  const fetchCartItems = async () => {
    try {
      setLoading(true);
      const retailerId = await AsyncStorage.getItem("userId");
      if (!retailerId) return resetCart();
      const { data, error } = await supabase
        .from("cart")
        .select(
          `
          id,
          crop_id,
          quantity,
          price_per_kg,
          total_price,
          produce:crop_id (id, crop_name, image_url, farmer_id, quantity)
        `
        )
        .eq("retailer_id", retailerId);
      if (error) throw error;
      setCartItems(data || []);
      setTotalPrice(calcTotal(data || []));
    } catch (err) {
      console.error("❌ Fetch cart error:", err);
      Alert.alert(t('error'), t('couldNotLoadCartItems'));
    } finally {
      setLoading(false);
    }
  };

  const resetCart = () => {
    setCartItems([]);
    setTotalPrice("0.00");
  };

  const calcTotal = (items) =>
    items.reduce((sum, i) => sum + (Number(i.total_price) || 0), 0).toFixed(2);

  // Update Quantity with Stock Check
  const updateQuantity = async (
    cartId,
    cropId,
    pricePerKg,
    oldQty,
    newQty,
    stockQty
  ) => {
    try {
      if (newQty < 1) {
        await removeItem(cartId, cropId, oldQty);
        return;
      }
      if (newQty > stockQty) {
        Alert.alert(t('outOfStock'), t('onlyStockAvailable', { stock: stockQty }));
        return;
      }
      const { error } = await supabase.rpc("update_cart_quantity", {
        p_cart_id: cartId,
        p_crop_id: cropId,
        p_price_per_kg: pricePerKg,
        p_old_qty: oldQty,
        p_new_qty: newQty,
      });
      if (error) throw error;
      fetchCartItems();
    } catch (err) {
      console.error("❌ Update quantity error:", err);
      Alert.alert(t('error'), err.message || t('couldNotUpdateQuantity'));
    }
  };

  // Remove Item
  const removeItem = async (cartId, cropId, qty) => {
    try {
      const { data: produceData, error: prodErr } = await supabase
        .from("produce")
        .select("quantity")
        .eq("id", cropId)
        .single();
      if (prodErr) throw prodErr;
      await Promise.all([
        supabase
          .from("produce")
          .update({ quantity: produceData.quantity + qty })
          .eq("id", cropId),
        supabase.from("cart").delete().eq("id", cartId),
      ]);
      fetchCartItems();
    } catch (err) {
      console.error("❌ Remove item error:", err);
      Alert.alert(t('error'), t('couldNotRemoveItem'));
    }
  };

  // Render Item using CartItem component
  const renderItem = ({ item }) => (
    <CartItem 
      item={item} 
      updateQuantity={updateQuantity} 
      removeItem={removeItem}
      navigation={navigation}
    />
  );

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#2E7D32" />
      </View>
    );
  }

  return (
    <LinearGradient colors={["#E0F7FA", "#FFFFFF"]} style={styles.container}>
      <Text style={styles.heading}>{t('yourCart')}</Text>
      {cartItems.length > 0 ? (
        <>
          <FlatList
            data={cartItems}
            renderItem={renderItem}
            keyExtractor={(item) => item.id.toString()}
            contentContainerStyle={styles.list}
          />
          <View style={styles.footer}>
            <Text style={styles.total}>{t('grandTotal', { total: totalPrice })}</Text>
            <TouchableOpacity
              style={styles.checkoutBtn}
              onPress={async () => {
                if (cartItems.length === 0) {
                  Alert.alert(t('cartEmpty'), t('pleaseAddItemsToCheckout'));
                  return;
                }
                navigation.navigate("drawer/payment", {
                  cartItems: cartItems,
                  totalAmount: totalPrice,
                });
              }}
            >
              <Text style={styles.checkoutText}>{t('proceedToCheckout')}</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{t('yourCartIsEmpty')}</Text>
        </View>
      )}
    </LinearGradient>
  );
}

// 🎨 Styles
const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  loading: { flex: 1, justifyContent: "center", alignItems: "center" },
  heading: {
    fontSize: 26,
    fontWeight: "bold",
    marginBottom: 20,
    color: "#0D47A1",
    textAlign: "center",
  },
  list: { paddingBottom: 20 },
  card: {
    flexDirection: "row",
    backgroundColor: "#FFF",
    marginBottom: 16,
    borderRadius: 14,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 6,
    elevation: 5,
    position: "relative",
    paddingRight: 40,
  },
  image: {
    width: 100,
    height: 100,
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
  },
  info: { flex: 1, padding: 12 },
  name: { fontSize: 18, fontWeight: "700", color: "#374151" },
  price: { fontSize: 15, color: "#6B7280", marginVertical: 4 },
  qtyRow: { flexDirection: "row", alignItems: "center", marginTop: 8 },
  qtyBtn: {
    backgroundColor: "#BBDEFB",
    width: 34,
    height: 34,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 8,
  },
  qtyText: { fontSize: 18, color: "#0D47A1", fontWeight: "bold" },
  qtyInput: {
    borderWidth: 1,
    borderColor: "#90CAF9",
    borderRadius: 8,
    width: 60,
    height: 34,
    textAlign: "center",
    marginHorizontal: 8,
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    backgroundColor: "#F3F4F6",
  },
  stock: { marginTop: 6, fontSize: 13, color: "#DC2626" },
  itemTotal: {
    marginTop: 8,
    fontWeight: "600",
    color: "#16A34A",
    fontSize: 16,
  },
  removeBtn: {
    position: "absolute",
    right: 10,
    top: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#DC2626",
    justifyContent: "center",
    alignItems: "center",
  },
  removeText: { color: "white", fontSize: 18, fontWeight: "bold" },
  footer: {
    borderTopWidth: 1,
    borderColor: "#E5E7EB",
    paddingTop: 16,
    marginTop: 12,
  },
  total: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#16A34A",
    textAlign: "center",
    marginBottom: 16,
  },
  checkoutBtn: {
    backgroundColor: "#0D47A1",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  checkoutText: { color: "white", fontWeight: "bold", fontSize: 16 },
  empty: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyText: { fontSize: 18, color: "#6B7280" },
  negotiateBtn: {
    marginTop: 12,
    padding: 10,
    backgroundColor: "#1E88E5",
    borderRadius: 8,
    alignItems: "center",
  },
  negotiateText: { color: "white", fontWeight: "bold", fontSize: 14 },
});