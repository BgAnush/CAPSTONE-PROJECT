// app/drawer/profile.js
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

// ✅ Import global i18n config (only once in the app root)
import "../languages/i18n";
import { supabase } from "../supabase/supabaseClient";

export default function Profile() {
  const router = useRouter();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [showPassword, setShowPassword] = useState(false);

  // Fetch profile data
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        setLoading(true);
        const userId = await AsyncStorage.getItem("userId");
        if (!userId) return;

        const { data, error } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", userId)
          .single();

        if (error) throw error;
        setProfile(data);
      } catch (err) {
        console.error("Profile fetch error:", err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>{t("profile.loading")}</Text>
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{t("profile.noProfileFound")}</Text>
      </View>
    );
  }

  const isFarmer = profile.role === "farmer";
  const theme = isFarmer ? farmerTheme : retailerTheme;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <StatusBar
        barStyle={isFarmer ? "dark-content" : "light-content"}
        backgroundColor={theme.headerBg}
      />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.headerBg }]}>
        <View style={styles.headerLeft}>
          <View style={styles.headerIconContainer}>
            <Ionicons
              name={isFarmer ? "leaf" : "cart"}
              size={28}
              color="white"
            />
          </View>
          <Text style={styles.headerTitle}>
            {isFarmer
              ? t('profile.farmerProfile')
              : t('profile.retailerProfile')}
          </Text>
        </View>

        {/* Language Selector */}
        <TouchableOpacity
          style={styles.languageButton}
          onPress={() => router.push("/LanguageSelector")}
        >
          <Ionicons name="globe-outline" size={24} color="white" />
        </TouchableOpacity>
      </View>

      {/* Profile Card */}
      <View
        style={[
          styles.card,
          {
            borderColor: theme.accent,
            shadowColor: theme.accent + "40",
          },
        ]}
      >
        {/* Info Section */}
        <View style={styles.infoSection}>
          <Text style={[styles.label, { color: theme.accent }]}>
            {t('profile.name')}
          </Text>
          <Text style={styles.value}>{profile.name}</Text>

          <Text style={[styles.label, { color: theme.accent }]}>
            {t('profile.email')}
          </Text>
          <Text style={styles.value}>{profile.email}</Text>

          <Text style={[styles.label, { color: theme.accent }]}>
            {t("profile.role")}
          </Text>
          <Text style={styles.value}>{profile.role}</Text>

          <Text style={[styles.label, { color: theme.accent }]}>
            {t("profile.joinedOn")}
          </Text>
          <Text style={styles.value}>
            {new Date(profile.created_at).toDateString()}
          </Text>
        </View>

        {/* Password Section */}
        <View style={styles.passwordSection}>
          <Text style={[styles.label, { color: theme.accent }]}>
            {t("profile.password")}
          </Text>
          <View
            style={[
              styles.passwordRow,
              { borderColor: theme.accent, backgroundColor: theme.passwordBg },
            ]}
          >
            <TextInput
              style={[styles.passwordInput, { color: theme.text }]}
              secureTextEntry={!showPassword}
              value={profile.password}
              editable={false}
            />
            <TouchableOpacity
              style={styles.passwordToggle}
              onPress={() => setShowPassword(!showPassword)}
            >
              <Ionicons
                name={showPassword ? "eye-off" : "eye"}
                size={22}
                color={theme.accent}
              />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Farmer Earnings */}
      {isFarmer && (
        <TouchableOpacity
          style={[
            styles.button,
            { backgroundColor: theme.accent, shadowColor: theme.accent + "80" },
          ]}
          activeOpacity={0.8}
          onPress={() => router.push("/drawer/earnings")}
        >
          <Ionicons name="cash" size={18} color="white" />
          <Text style={styles.buttonText}>{t('profile.earnings')}</Text>
          
        </TouchableOpacity>
      )}

      {/* Change Password */}
      <TouchableOpacity
        style={[
          styles.button,
          { backgroundColor: theme.accent, shadowColor: theme.accent + "80" },
        ]}
        activeOpacity={0.8}
        onPress={() => router.push("drawer/ChangePassword")}
      >
        <Ionicons name="lock-closed" size={18} color="white" />
        <Text style={styles.buttonText}>{t("profile.changePassword")}</Text>
      </TouchableOpacity>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: theme.accent }]}>
          {t("profile.footer")}
        </Text>
      </View>
    </SafeAreaView>
  );
}

/** =========================
 * Styles and Themes
 * ========================= */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
  },
  loadingText: { marginTop: 12, fontSize: 16, color: "#666" },
  errorText: { fontSize: 18, color: "#d32f2f", fontWeight: "500" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  headerLeft: { flexDirection: "row", alignItems: "center" },
  headerIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "white",
    marginLeft: 16,
    letterSpacing: 0.5,
  },
  languageButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
  },
  card: {
    backgroundColor: "white",
    marginHorizontal: 20,
    marginTop: 24,
    marginBottom: 16,
    padding: 24,
    borderRadius: 20,
    borderWidth: 1.5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  infoSection: { marginBottom: 20 },
  label: {
    fontSize: 13,
    fontWeight: "700",
    marginTop: 16,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    opacity: 0.9,
  },
  value: {
    fontSize: 17,
    fontWeight: "500",
    color: "#333",
    lineHeight: 24,
    paddingBottom: 2,
  },
  passwordSection: { marginTop: 8 },
  passwordRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 4,
    height: 50,
  },
  passwordInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: "500",
    paddingVertical: 8,
  },
  passwordToggle: { padding: 8, marginLeft: 8 },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 20,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 14,
    marginTop: 8,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  buttonText: {
    color: "white",
    fontSize: 16,
    marginLeft: 10,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  footer: { marginTop: "auto", paddingVertical: 16, alignItems: "center" },
  footerText: { fontSize: 14, fontWeight: "500", opacity: 0.8 },
});

const farmerTheme = {
  bg: "#f8fbf5",
  headerBg: "#2e7d32",
  accent: "#388e3c",
  text: "#2e7d32",
  passwordBg: "rgba(56, 142, 60, 0.05)",
};

const retailerTheme = {
  bg: "#f5f9ff",
  headerBg: "#1565c0",
  accent: "#1976d2",
  text: "#1565c0",
  passwordBg: "rgba(25, 118, 210, 0.05)",
};
