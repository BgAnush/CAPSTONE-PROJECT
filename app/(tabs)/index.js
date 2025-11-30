import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';
import 'react-native-gesture-handler';
import 'react-native-reanimated';

export default function SplashScreen() {
  const router = useRouter();
  
  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const translateYAnim = useRef(new Animated.Value(30)).current;
  const logoAnim = useRef(new Animated.Value(1)).current;
  
  useEffect(() => {
    // Create a sequence of animations
    Animated.sequence([
      // Initial fade in and scale up
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.elastic(1.2),
          useNativeDriver: true,
        }),
        Animated.timing(translateYAnim, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ]),
      
      // Logo pulse effect
      Animated.loop(
        Animated.sequence([
          Animated.timing(logoAnim, {
            toValue: 1.05,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(logoAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      ),
    ]).start();

    // Navigate to home after 3 seconds
    const timer = setTimeout(() => {
      router.replace('/home');
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.container}>
      <Animated.View 
        style={[
          styles.contentContainer,
          {
            opacity: fadeAnim,
            transform: [
              { scale: scaleAnim },
              { translateY: translateYAnim }
            ]
          }
        ]}
      >
        <Animated.View style={{ transform: [{ scale: logoAnim }] }}>
          <Image
            source={require('../../assets/images/NammaRaithaLOGO.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </Animated.View>
        
        <Text style={styles.title}>Namma Raitha</Text>
        <Text style={styles.subtitle}>Empowering Farmers & Retailers</Text>
        
        <View style={styles.footer}>
          <Animated.View 
            style={[
              styles.dot,
              {
                opacity: fadeAnim,
                transform: [{ scale: scaleAnim }]
              }
            ]} 
          />
          <Animated.View 
            style={[
              styles.dot,
              {
                opacity: fadeAnim,
                transform: [{ scale: scaleAnim }]
              }
            ]} 
          />
          <Animated.View 
            style={[
              styles.dot,
              {
                opacity: fadeAnim,
                transform: [{ scale: scaleAnim }]
              }
            ]} 
          />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#07fab5ff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  contentContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingHorizontal: 20,
  },
  logo: {
    width: 180,
    height: 180,
    marginBottom: 20,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#2e7d32',
    marginBottom: 8,
    letterSpacing: 1,
    textShadowColor: 'rgba(0, 0, 0, 0.1)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  subtitle: {
    fontSize: 16,
    color: '#1b5e20',
    marginBottom: 40,
    textAlign: 'center',
    fontWeight: '500',
    letterSpacing: 0.5,
  },
  footer: {
    flexDirection: 'row',
    marginTop: 20,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#2e7d32',
    marginHorizontal: 5,
  },
});