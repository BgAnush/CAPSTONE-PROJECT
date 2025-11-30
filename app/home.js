import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next"; // import i18n hook
import {
  ActivityIndicator,
  Animated,
  ImageBackground,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import "./languages/i18n"; // ensure i18n is initialized

export default function Home() {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fade-in animation
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 1200,
      useNativeDriver: true,
    }).start();

    // Load selected language from AsyncStorage
    const loadLanguage = async () => {
      try {
        const lang = await AsyncStorage.getItem("selectedLanguage");
        if (lang) {
          await i18n.changeLanguage(lang); // switch language
        }
      } catch (err) {
        console.error("Error loading language:", err);
      } finally {
        setLoading(false);
      }
    };

    loadLanguage();
  }, []);

  const handleGetStarted = () => {
    router.push("/login");
  };

  if (loading) {
    return (
      <View
        style={[
          styles.background,
          { justifyContent: "center", alignItems: "center" },
        ]}
      >
        <ActivityIndicator size="large" color="#4caf50" />
      </View>
    );
  }

  return (
    <ImageBackground
      source={require("../assets/images/farm.jpeg")}
      style={styles.background}
      resizeMode="cover"
    >
      <View style={styles.overlay}>
        <Animated.View style={{ opacity: fadeAnim, alignItems: "center" }}>
          <Text style={styles.title}>{t("welcomeTitle")}</Text>
          <Text style={styles.description}>{t("welcomeSubtitle")}</Text>

          <TouchableOpacity style={styles.button} onPress={handleGetStarted}>
            <Text style={styles.buttonText}>{t("getStarted")}</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    width: "100%",
    height: "100%",
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.45)", // Dark overlay
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 30,
    fontWeight: "bold",
    color: "#fff",
    textAlign: "center",
    marginBottom: 16,
  },
  description: {
    fontSize: 17,
    color: "#eee",
    textAlign: "center",
    marginBottom: 30,
    paddingHorizontal: 10,
    lineHeight: 24,
  },
  button: {
    backgroundColor: "#4caf50",
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 30,
    elevation: 4,
  },
  buttonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "bold",
  },
});
