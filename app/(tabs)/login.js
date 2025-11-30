import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Button,
  ImageBackground,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import '../languages/i18n';
import { supabase } from '../supabase/supabaseClient';

export default function LoginScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const autoLogin = async () => {
      try {
        const storedEmail = await AsyncStorage.getItem('userEmail');
        const storedPassword = await AsyncStorage.getItem('userPassword');
        const storedRole = await AsyncStorage.getItem('userRole');
        if (storedEmail && storedPassword && storedRole) {
          const { data, error: authError } = await supabase.auth.signInWithPassword({
            email: storedEmail,
            password: storedPassword,
          });
          if (!authError) {
            redirectToDashboard(storedRole);
            return;
          }
        }
      } catch (err) {
        console.error('Auto-login error:', err);
      } finally {
        setLoading(false);
      }
    };
    autoLogin();
  }, []);

  const redirectToDashboard = (role) => {
    if (role === 'farmer') router.replace('/(tabs)/farmerDashboard');
    else if (role === 'retailer') router.replace('/(tabs)/retailerDashboard');
    else setError('Could not determine user role');
  };

  const loginUser = async () => {
    setError('');
    if (!email || !password) {
      setError(t('login.errorEnterEmailPassword'));
      return;
    }
    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) return setError(authError.message);

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, role')
        .eq('id', authData.user.id)
        .single();

      if (profileError) return setError(t('login.errorFetchProfile'));

      await AsyncStorage.setItem('userEmail', email);
      await AsyncStorage.setItem('userPassword', password);
      await AsyncStorage.setItem('userRole', profileData.role);
      await AsyncStorage.setItem('userId', profileData.id);

      Alert.alert(t('login.loginSuccess'));
      redirectToDashboard(profileData.role);
    } catch (err) {
      console.error('Login error:', err);
      setError('Something went wrong during login');
    }
  };

  const handleForgotPassword = () => {
    if (!email) return setError('Please enter email first');
    router.push('/drawer/ChangePassword');
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ImageBackground 
          source={require('../../assets/images/login.jpg')} 
          style={styles.backgroundImage} 
          resizeMode="cover"
        >
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#fff" />
          </View>
        </ImageBackground>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ImageBackground 
        source={require('../../assets/images/login.jpg')} 
        style={styles.backgroundImage} 
        resizeMode="cover"
      >
        <View style={styles.overlay}>
          <View style={styles.formContainer}>
            <Text style={styles.title}>{t('login.title')}</Text>
            <Text style={styles.subtitle}>{t('login.subtitle')}</Text>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <TextInput
              placeholder={t('login.email')}
              value={email}
              onChangeText={setEmail}
              style={styles.input}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholderTextColor="rgba(255,255,255,0.7)"
            />

            <View style={styles.passwordContainer}>
              <TextInput
                placeholder={t('login.password')}
                value={password}
                onChangeText={setPassword}
                style={styles.passwordInput}
                secureTextEntry={!showPassword}
                placeholderTextColor="rgba(255,255,255,0.7)"
              />
              <TouchableOpacity style={styles.toggleButton} onPress={() => setShowPassword(!showPassword)}>
                <Text style={styles.toggleText}>{showPassword ? t('login.hide') : t('login.show')}</Text>
              </TouchableOpacity>
            </View>

            <Button 
              title={t('login.loginButton')} 
              onPress={loginUser} 
              color="#4CAF50" 
              style={styles.button}
            />

            <View style={styles.linksContainer}>
              <TouchableOpacity style={styles.linkButton} onPress={() => router.push('(tabs)/signup')}>
                <Text style={styles.linkText}>{t('login.createAccount')}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.linkButton} onPress={handleForgotPassword}>
                <Text style={styles.linkText}>{t('login.forgotPassword')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1,
    width: '100%',
    height: '100%',
  },
  backgroundImage: { 
    flex: 1,
    width: '100%',
    height: '100%',
    justifyContent: 'center',
  },
  overlay: { 
    flex: 1, 
    backgroundColor: 'rgba(0,0,0,0.3)', 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  loadingContainer: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  formContainer: {
    width: '85%',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 20,
    padding: 25,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  title: { 
    fontSize: 32, 
    fontWeight: 'bold', 
    color: '#fff', 
    marginBottom: 10, 
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  subtitle: { 
    fontSize: 16, 
    color: 'rgba(255, 255, 255, 0.8)', 
    marginBottom: 25, 
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  errorText: { 
    color: '#FF5252', 
    marginBottom: 15, 
    textAlign: 'center', 
    fontWeight: '500',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: 8,
    borderRadius: 8,
  },
  input: { 
    borderWidth: 1, 
    borderColor: 'rgba(255, 255, 255, 0.3)', 
    borderRadius: 12, 
    padding: 15, 
    marginBottom: 15, 
    backgroundColor: 'rgba(255, 255, 255, 0.1)', 
    fontSize: 16, 
    color: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  passwordContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    borderWidth: 1, 
    borderColor: 'rgba(255, 255, 255, 0.3)', 
    borderRadius: 12, 
    marginBottom: 15, 
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  passwordInput: { 
    flex: 1, 
    padding: 15, 
    fontSize: 16, 
    color: '#fff' 
  },
  toggleButton: { 
    padding: 15,
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255, 255, 255, 0.2)',
  },
  toggleText: { 
    color: 'rgba(255, 255, 255, 0.7)', 
    fontWeight: '500' 
  },
  linksContainer: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    marginTop: 20 
  },
  linkButton: { 
    padding: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  linkText: { 
    color: 'rgba(255, 255, 255, 0.8)', 
    fontWeight: '500',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  button: {
    marginTop: 10,
    borderRadius: 12,
    overflow: 'hidden',
  }
});