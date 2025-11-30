// app/Signup.js
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  ImageBackground,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import '../languages/i18n'; // ensure i18n is loaded
import { supabase } from '../supabase/supabaseClient';

export default function Signup() {
  const { t } = useTranslation(); // translation hook
  const router = useRouter();
  const [formData, setFormData] = useState({
    email: '',
    name: '',
    password: '',
    confirmPassword: '',
    role: '',
  });
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);

  const handleInputChange = (key, value) =>
    setFormData(prev => ({ ...prev, [key]: value }));

  const handleRoleChange = role =>
    setFormData(prev => ({ ...prev, role }));

  const handleSubmit = async () => {
    try {
      const { data: signUpData, error: signUpError } =
        await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
        });

      if (signUpError) return Alert.alert('Sign Up Error', signUpError.message);

      const userId = signUpData.user?.id;
      if (!userId) return Alert.alert('Error', 'User ID missing after registration');

      const { error: insertError } = await supabase.from('profiles').insert([
        {
          id: userId,
          email: formData.email,
          name: formData.name,
          role: formData.role,
        },
      ]);

      if (insertError) return Alert.alert('Database Error', insertError.message);

      await AsyncStorage.setItem('userEmail', formData.email);
      await AsyncStorage.setItem('userRole', formData.role);

      const successMsg = 'Account created successfully!';
      if (Platform.OS === 'web') {
        alert(successMsg);
        router.push('/login');
      } else {
        Alert.alert('Success', successMsg, [
          { text: 'OK', onPress: () => router.push('/login') },
        ]);
      }
    } catch (err) {
      console.error(err);
      Alert.alert('Error', err.message || 'Sign up failed');
    }
  };

  return (
    <ImageBackground
      source={require('../../assets/images/signup-bg.jpeg')}
      style={styles.background}
      resizeMode="cover"
    >
      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
        <View style={styles.glassContainer}>
          <Text style={styles.title}>{t('signup.title')}</Text>

          <TextInput
            placeholder={t('signup.email')}
            value={formData.email}
            onChangeText={text => handleInputChange('email', text)}
            style={styles.input}
            placeholderTextColor="#ccc"
          />

          <TextInput
            placeholder={t('signup.name')}
            value={formData.name}
            onChangeText={text => handleInputChange('name', text)}
            style={styles.input}
            placeholderTextColor="#ccc"
          />

          <TextInput
            placeholder={t('signup.password')}
            value={formData.password}
            onChangeText={text => handleInputChange('password', text)}
            style={styles.input}
            secureTextEntry={!showPassword}
            placeholderTextColor="#ccc"
          />

          <TextInput
            placeholder={t('signup.confirmPassword')}
            value={formData.confirmPassword}
            onChangeText={text => handleInputChange('confirmPassword', text)}
            style={styles.input}
            secureTextEntry={!showPassword}
            placeholderTextColor="#ccc"
          />

          <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
            <Text style={styles.toggle}>
              {showPassword ? t('signup.hidePassword') : t('signup.showPassword')}
            </Text>
          </TouchableOpacity>

          <View style={styles.roleContainer}>
            <Text style={styles.sectionLabel}>{t('signup.roleLabel')}</Text>
            <View style={styles.roleOptions}>
              {['farmer', 'retailer'].map(role => (
                <TouchableOpacity
                  key={role}
                  style={[
                    styles.roleButton,
                    formData.role === role && styles.selectedRole,
                  ]}
                  onPress={() => handleRoleChange(role)}
                >
                  <Text style={styles.roleText}>{t(`signup.${role}`)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <TouchableOpacity style={styles.button} onPress={handleSubmit}>
            <Text style={styles.buttonText}>{t('signup.signUpButton')}</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.push('/login')}>
            <Text style={styles.loginText}>{t('signup.alreadyAccount')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1, width: '100%', height: '100%' },
  scrollContainer: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  glassContainer: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 20,
    padding: 30,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 30,
    color: '#fff',
  },
  input: {
    backgroundColor: 'transparent',
    padding: 15,
    marginBottom: 15,
    borderRadius: 12,
    fontSize: 16,
    color: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  toggle: {
    color: '#fff',
    fontSize: 14,
    marginBottom: 20,
    textAlign: 'right',
    opacity: 0.8,
  },
  roleContainer: { marginBottom: 20 },
  sectionLabel: { fontSize: 16, fontWeight: '600', color: '#fff', opacity: 0.9 },
  roleOptions: { flexDirection: 'row', justifyContent: 'space-between' },
  roleButton: {
    flex: 1,
    padding: 15,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginHorizontal: 5,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  selectedRole: { backgroundColor: 'rgba(76,175,80,0.3)' },
  roleText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  button: {
    backgroundColor: 'rgba(76,175,80,0.85)',
    padding: 18,
    borderRadius: 12,
    marginTop: 10,
  },
  buttonText: { textAlign: 'center', color: '#fff', fontWeight: '700', fontSize: 18 },
  loginText: {
    marginTop: 20,
    color: '#fff',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  languageBar: {
    position: 'absolute',
    top: 40,
    right: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    zIndex: 10,
  },
  languageBarText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
});
