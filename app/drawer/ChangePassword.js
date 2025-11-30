import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNavigation } from "@react-navigation/native";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next"; // Import i18n hook
import {
  ActivityIndicator,
  Alert,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { supabase } from "../supabase/supabaseClient";

export default function ChangePasswordScreen() {
  const { t } = useTranslation(); // Initialize translation hook
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [email, setEmail] = useState("");
  const [manualEmail, setManualEmail] = useState("");
  const [emailConfirmed, setEmailConfirmed] = useState(false);
  const [emailRejected, setEmailRejected] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [confirmPasswordError, setConfirmPasswordError] = useState("");

  useEffect(() => {
    // Fetch user email from Supabase auth
    const fetchUserEmail = async () => {
      try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error || !user) {
          setEmailRejected(true);
        } else {
          setEmail(user.email);
        }
      } catch (err) {
        console.error("Error fetching user:", err.message);
        setEmailRejected(true);
      } finally {
        setLoading(false);
      }
    };
    fetchUserEmail();
  }, []);

  // Email validation regex
  const validateEmail = (mail) => /^[^\s@]+@[^\s@]+\.(com|in)$/.test(mail);
  
  // Password validation regex
  const validatePassword = (pwd) =>
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/.test(pwd);

  const handleChangePassword = async () => {
    // Reset error states
    setEmailError("");
    setPasswordError("");
    setConfirmPasswordError("");
    
    const finalEmail = emailConfirmed ? email : manualEmail.trim();
    
    // Email validation
    if (!finalEmail) {
      setEmailError(t('emailRequired'));
      return;
    } else if (!validateEmail(finalEmail)) {
      setEmailError(t('emailInvalid'));
      return;
    }
    
    // Password validation
    if (!password) {
      setPasswordError(t('passwordRequired'));
      return;
    } else if (!validatePassword(password)) {
      setPasswordError(t('passwordInvalid'));
      return;
    }
    
    // Confirm password validation
    if (password !== confirmPassword) {
      setConfirmPasswordError(t('passwordMismatch'));
      return;
    }
    
    try {
      setProcessing(true);
      
      if (emailConfirmed) {
        // Update current user's password in auth
        const { error: authUpdateError } = await supabase.auth.updateUser({
          password: password,
        });
        
        if (authUpdateError) throw authUpdateError;
        
        // Get current user id
        const { data: { user } } = await supabase.auth.getUser();
        
        // Update the profiles table
        const { error: profileUpdateError } = await supabase
          .from('profiles')
          .update({ password: password })
          .eq('id', user.id);
          
        if (profileUpdateError) throw profileUpdateError;
        
        // Save password locally (optional)
        await AsyncStorage.setItem("userPassword", password);
        
        Alert.alert(t('success'), t('passwordUpdated'));
        resetForm();
        navigation.navigate("drawer/profile");
      } else {
        // For another user, get user id from profiles by email
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("id")
          .eq("email", finalEmail)
          .single();
          
        if (profileError || !profile?.id) {
          setEmailError(t('emailNotFound'));
          setProcessing(false);
          return;
        }
        
        // Use RPC function to update both auth and profile
        const { error: updateError } = await supabase.rpc('update_user_password', {
          user_id: profile.id,
          new_password: password
        });
        
        if (updateError) throw updateError;
        
        Alert.alert(t('success'), t('passwordUpdated'));
        resetForm();
        navigation.navigate("drawer/profile");
      }
    } catch (err) {
      console.error("Password update error:", err);
      Alert.alert(t('error'), err.message || t('passwordUpdateFailed'));
    } finally {
      setProcessing(false);
    }
  };

  const resetForm = () => {
    setPassword("");
    setConfirmPassword("");
    setManualEmail("");
    setEmailConfirmed(false);
    setEmailRejected(false);
    setEmailError("");
    setPasswordError("");
    setConfirmPasswordError("");
  };

  if (loading) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator size="large" color="#1976d2" />
        <Text style={styles.loadingText}>{t('loadingUserData')}</Text>
      </View>
    );
  }

  return (
    <ImageBackground
      source={require("../../assets/images/changepassword.jpeg")}
      style={styles.background}
      resizeMode="cover"
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.container}
      >
        <View style={styles.formCard}>
          <Text style={styles.title}>{t('changePassword')}</Text>
          
          {/* Email confirmation section */}
          {!emailConfirmed && email && !emailRejected && (
            <View style={styles.emailConfirmation}>
              <Text style={styles.emailText}>{t('isThisYourEmail')}</Text>
              <Text style={styles.emailValue}>{email}</Text>
              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={[styles.button, styles.confirmButton]}
                  onPress={() => setEmailConfirmed(true)}
                >
                  <Text style={styles.buttonText}>{t('yes')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.button, styles.rejectButton]}
                  onPress={() => setEmailRejected(true)}
                >
                  <Text style={styles.buttonText}>{t('no')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          
          {/* Manual email input section */}
          {(emailRejected || !email) && !emailConfirmed && (
            <>
              <View style={styles.inputContainer}>
                <TextInput
                  placeholder={t('enterYourEmail')}
                  style={styles.input}
                  value={manualEmail}
                  onChangeText={setManualEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  placeholderTextColor="#999"
                />
              </View>
              {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}
            </>
          )}
          
          {/* New password input */}
          <View style={styles.inputContainer}>
            <TextInput
              placeholder={t('newPassword')}
              secureTextEntry={!showPassword}
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholderTextColor="#999"
            />
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => setShowPassword(!showPassword)}
            >
              <Feather
                name={showPassword ? "eye" : "eye-off"}
                size={20}
                color="#1976d2"
              />
            </TouchableOpacity>
          </View>
          {passwordError ? <Text style={styles.errorText}>{passwordError}</Text> : null}
          
          {/* Confirm password input */}
          <View style={styles.inputContainer}>
            <TextInput
              placeholder={t('confirmPassword')}
              secureTextEntry={!showConfirmPassword}
              style={styles.input}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholderTextColor="#999"
            />
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => setShowConfirmPassword(!showConfirmPassword)}
            >
              <Feather
                name={showConfirmPassword ? "eye" : "eye-off"}
                size={20}
                color="#1976d2"
              />
            </TouchableOpacity>
          </View>
          {confirmPasswordError ? (
            <Text style={styles.errorText}>{confirmPasswordError}</Text>
          ) : null}
          
          {/* Submit button */}
          <TouchableOpacity
            style={[styles.button, styles.submitButton, processing && styles.disabledButton]}
            onPress={handleChangePassword}
            disabled={processing}
          >
            {processing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.buttonText}>{t('updatePassword')}</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1, width: "100%" },
  container: { 
    flex: 1, 
    justifyContent: "center", 
    alignItems: "flex-end", // form on right
    padding: 20,
  },
  centeredContainer: { 
    flex: 1, 
    justifyContent: "center", 
    alignItems: "center", 
    backgroundColor: "#f5f5f5" 
  },
  loadingText: { 
    marginTop: 10, 
    fontSize: 16, 
    color: "#fff", // make loading text white
    textShadowColor: "rgba(0, 0, 0, 0.7)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  formCard: {
    width: "90%",
    maxWidth: 400,
    backgroundColor: "rgba(0, 0, 0, 0.4)", // slightly darker for readability
    borderRadius: 16,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  title: { 
    fontSize: 24, 
    fontWeight: "700", 
    color: "#fff", // white text
    marginBottom: 24, 
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.7)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  emailConfirmation: { 
    marginBottom: 20, 
    padding: 16, 
    backgroundColor: "rgba(0,0,0,0.3)", // dark background for readability
    borderRadius: 8, 
    borderWidth: 1, 
    borderColor: "rgba(255,255,255,0.3)" 
  },
  emailText: { 
    fontSize: 16, 
    color: "#fff", 
    marginBottom: 4,
    textShadowColor: "rgba(0,0,0,0.7)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  emailValue: { 
    fontSize: 18, 
    fontWeight: "600", 
    color: "#fff", 
    marginBottom: 12,
    textShadowColor: "rgba(0,0,0,0.7)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  buttonRow: { flexDirection: "row", justifyContent: "space-around" },
  inputContainer: { 
    flexDirection: "row", 
    alignItems: "center", 
    borderWidth: 1, 
    borderColor: "#fff", 
    borderRadius: 8, 
    marginBottom: 8, 
    paddingHorizontal: 12, 
    backgroundColor: "rgba(95, 39, 39, 0.2)" // semi-transparent but dark
  },
  input: { 
    flex: 1, 
    height: 48, 
    fontSize: 16, 
    color: "#ffffffff", // input text white
  },
  iconButton: { padding: 8 },
  button: { paddingVertical: 14, borderRadius: 8, alignItems: "center", justifyContent: "center", minWidth: 100 },
  confirmButton: { backgroundColor: "rgba(76, 175, 80, 0.8)", flex: 1, marginRight: 8 },
  rejectButton: { backgroundColor: "rgba(244, 67, 54, 0.8)", flex: 1, marginLeft: 8 },
  submitButton: { backgroundColor: "rgba(25, 118, 210, 0.9)", marginTop: 16 },
  disabledButton: { backgroundColor: "rgba(144, 202, 249, 0.6)" },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  errorText: { color: "#ffcccc", fontSize: 14, marginBottom: 8 },
  successText: { color: "#ccffcc", fontSize: 14, marginBottom: 8, textAlign: "center" },
});