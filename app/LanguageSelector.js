// app/languageSelector.js
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";

// Supported languages
export const LANGUAGES = {
  en: "English",
  hi: "Hindi",
  kn: "Kannada",
  te: "Telugu",
  ta: "Tamil",
};

export default function LanguageSelectorPage() {
  const [language, setLanguage] = useState("en");
  const [loading, setLoading] = useState(true);

  const router = useRouter();
  const { redirectTo } = useLocalSearchParams();  // param from signup/profile

  // Load saved language on mount
  useEffect(() => {
    const loadLang = async () => {
      try {
        const storedLang =
          Platform.OS === "web"
            ? localStorage.getItem("selectedLanguage")
            : await AsyncStorage.getItem("selectedLanguage");
        if (storedLang && LANGUAGES[storedLang]) {
          setLanguage(storedLang);
        }
      } catch (err) {
        console.error("Error loading language:", err);
      } finally {
        setLoading(false);
      }
    };
    loadLang();
  }, []);

  // Change and persist language
  const changeLanguage = async (langCode) => {
    if (!LANGUAGES[langCode]) return;
    setLanguage(langCode);
    try {
      if (Platform.OS === "web") {
        localStorage.setItem("selectedLanguage", langCode);
      } else {
        await AsyncStorage.setItem("selectedLanguage", langCode);
      }
    } catch (err) {
      console.error("Error saving language:", err);
    }
  };

  const handleLanguageSelect = async (langCode) => {
    await changeLanguage(langCode);
    // Always redirect to home after language selection
    router.replace("/");
  };

  const handleClose = () => {
    if (redirectTo === "signup") {
      router.replace("/signup");
    } else if (redirectTo === "profile") {
      router.replace("/profile");
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/");
    }
  };

  if (loading) return null; // or a loader while fetching saved lang

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Select Language</Text>

      {Object.keys(LANGUAGES).map((code) => (
        <TouchableOpacity
          key={code}
          style={[
            styles.languageOption,
            language === code && styles.selectedLanguage,
          ]}
          onPress={() => handleLanguageSelect(code)}
        >
          <Text style={styles.languageText}>{LANGUAGES[code]}</Text>
        </TouchableOpacity>
      ))}

      {/* Close Button */}
      <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
        <Text style={styles.closeText}>Close</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#f5f5f5",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 20,
  },
  languageOption: {
    width: "80%",
    padding: 15,
    marginVertical: 10,
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ddd",
    alignItems: "center",
  },
  selectedLanguage: {
    backgroundColor: "#32CD32",
  },
  languageText: {
    fontSize: 18,
  },
  closeButton: {
    marginTop: 30,
    padding: 15,
    backgroundColor: "#ff4d4d",
    borderRadius: 8,
    width: "60%",
    alignItems: "center",
  },
  closeText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
});