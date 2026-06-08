import React, { useState, useEffect, useRef } from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
  Alert,
  Image,
  useColorScheme,
  Animated,
  Dimensions,
  StatusBar,
  ActivityIndicator,
} from "react-native";
import { auth } from "../firebase";
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
} from "firebase/auth";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import NetInfo from "@react-native-community/netinfo";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import * as NavigationBar from "expo-navigation-bar";

const { width, height } = Dimensions.get('window');

// Enhanced color themes
const lightTheme = {
  background: "#FFFFFF",
  backgroundGradient: ["#F8FAFC", "#FFFFFF"],
  primary: "#007AFF",
  primaryLight: "#5AADFF",
  primaryDark: "#0050CC",
  secondary: "#5856D6",
  text: "#111827",
  textSecondary: "#6B7280",
  textTertiary: "#9CA3AF",
  card: "#FFFFFF",
  cardElevated: "#F9FAFB",
  border: "#E5E7EB",
  borderLight: "#F0F0F0",
  success: "#10B981",
  warning: "#F59E0B",
  error: "#EF4444",
  overlay: "rgba(255, 255, 255, 0.8)",
  shadow: "#000000",
  info: "#3B82F6",
  infoLight: "#EFF6FF",
};

const darkTheme = {
  background: "#000000",
  backgroundGradient: ["#111827", "#1F2937"],
  primary: "#0A84FF",
  primaryLight: "#3DA0FF",
  primaryDark: "#0056CC",
  secondary: "#5E5CE6",
  text: "#F9FAFB",
  textSecondary: "#D1D5DB",
  textTertiary: "#6B7280",
  card: "#1F2937",
  cardElevated: "#374151",
  border: "#374151",
  borderLight: "#28282A",
  success: "#10B981",
  warning: "#F59E0B",
  error: "#EF4444",
  overlay: "rgba(0, 0, 0, 0.8)",
  shadow: "#000000",
  info: "#60A5FA",
  infoLight: "#1E3A8A",
};

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isConnected, setIsConnected] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isVerificationLoading, setIsVerificationLoading] = useState(false);
  const [showVerificationAlert, setShowVerificationAlert] = useState(false);
  const [isFocused, setIsFocused] = useState({ email: false, password: false });
  const [buttonScale] = useState(new Animated.Value(1));
  
  // Animations
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const logoScale = useRef(new Animated.Value(0.8)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const verificationAlertAnim = useRef(new Animated.Value(0)).current;

  const scheme = useColorScheme();
  const isDark = scheme === "dark";
  const theme = isDark ? darkTheme : lightTheme;

  useEffect(() => {
    // Hide status bar
    StatusBar.setHidden(true, "slide");

    // Hide navigation bar (Android)
    NavigationBar.setVisibilityAsync("hidden");
    NavigationBar.setBehaviorAsync("overlay-swipe");

    return () => {
      StatusBar.setHidden(false, "slide");
      NavigationBar.setVisibilityAsync("visible");
    };
  }, []);

  // Entrance animations
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
        delay: 200,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
        delay: 200,
      }),
      Animated.spring(logoScale, {
        toValue: 1,
        tension: 100,
        friction: 8,
        useNativeDriver: true,
        delay: 300,
      }),
    ]).start();

    // Pulse animation for background elements
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.1,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  // Network detection
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsConnected(state.isConnected);
    });
    return () => unsubscribe();
  }, []);

  // Button press animation
  const animateButtonPress = () => {
    Animated.sequence([
      Animated.timing(buttonScale, {
        toValue: 0.95,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(buttonScale, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
  };

  // Shake Animation with Haptics
  const triggerShake = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  // Show verification alert animation
  const showVerificationAlertAnimation = () => {
    setShowVerificationAlert(true);
    Animated.spring(verificationAlertAnim, {
      toValue: 1,
      tension: 100,
      friction: 8,
      useNativeDriver: true,
    }).start();
  };

  // Hide verification alert animation
  const hideVerificationAlertAnimation = () => {
    Animated.timing(verificationAlertAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setShowVerificationAlert(false);
    });
  };

  // Send verification email
  const handleSendVerificationEmail = async () => {
    setIsVerificationLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    try {
      // Re-authenticate to get current user
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      // Send verification email
      await sendEmailVerification(user);
      
      // Sign out since email is not verified
      await auth.signOut();
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
      Alert.alert(
        "Verification Email Sent ✅",
        "A new verification email has been sent to your inbox. Please check your email and click the verification link to activate your account.",
        [
          {
            text: "OK",
            onPress: () => {
              setEmail("");
              setPassword("");
              hideVerificationAlertAnimation();
            },
          },
        ]
      );
    } catch (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        "Error",
        "Failed to send verification email. Please try again."
      );
    } finally {
      setIsVerificationLoading(false);
    }
  };

  // Login Handler with Email Verification Check
  const handleLogin = async () => {
    if (isLoading) return;
    
    // Validation
    if (!email.trim() || !password.trim()) {
      triggerShake();
      Alert.alert("Missing Information", "Please fill in both email and password.");
      return;
    }

    if (!/\S+@\S+\.\S+/.test(email)) {
      triggerShake();
      Alert.alert("Invalid Email", "Please enter a valid email address.");
      return;
    }

    if (!isConnected) {
      Alert.alert(
        "Offline Mode",
        "Please connect to the internet to sign in.",
        [{ text: "OK" }]
      );
      return;
    }

    setIsLoading(true);
    animateButtonPress();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      // Check if email is verified
      if (!user.emailVerified) {
        // Sign out the user since email is not verified
        await auth.signOut();
        
        triggerShake();
        showVerificationAlertAnimation();
        setIsLoading(false);
        return;
      }
      
      // Email is verified, proceed with login
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
      Alert.alert(
        "Welcome Back! 🎉",
        "Successfully logged in.",
        [
          {
            text: "Continue",
            onPress: () => navigation.replace("Home"),
          },
        ]
      );
    } catch (error) {
      triggerShake();
      let errorMessage = "Unable to sign in. Please check your email or password.";
      
      switch (error.code) {
        case "auth/invalid-email":
          errorMessage = "Please enter a valid email address.";
          break;
        case "auth/user-not-found":
          errorMessage = "No account found with this email.";
          break;
        case "auth/wrong-password":
          errorMessage = "Incorrect password. Please try again.";
          break;
        case "auth/user-disabled":
          errorMessage = "This account has been deactivated.";
          break;
        case "auth/too-many-requests":
          errorMessage = "Too many failed attempts. Please try again later.";
          break;
        case "auth/network-request-failed":
          errorMessage = "Network error. Please check your connection.";
          break;
        case "auth/email-already-in-use":
          errorMessage = "This email is already registered.";
          break;
      }
      
      Alert.alert("Sign In Failed", errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // Forgot Password with Haptic feedback
  const handleForgotPassword = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    if (!email.trim()) {
      Alert.alert(
        "Email Required",
        "Please enter your email address to reset password.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Enter Email",
            onPress: () => {
              // Focus on email input would be handled with refs
            },
          },
        ]
      );
      return;
    }

    if (!isConnected) {
      Alert.alert("Offline", "You need an internet connection to reset your password.");
      return;
    }

    Alert.alert(
      "Reset Password",
      `Send password reset instructions to ${email}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Send",
          style: "default",
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            sendPasswordResetEmail(auth, email)
              .then(() =>
                Alert.alert(
                  "Check Your Email 📧",
                  "Password reset instructions have been sent to your email address.",
                  [{ text: "OK" }]
                )
              )
              .catch((err) => {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                Alert.alert(
                  "Error",
                  err.code === "auth/user-not-found"
                    ? "No account found with this email."
                    : "Unable to send reset email. Please try again."
                );
              });
          },
        },
      ]
    );
  };

  // Navigation with Haptics
  const navigateToRegister = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("Register");
  };

  // Toggle password visibility with Haptics
  const togglePasswordVisibility = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowPassword(!showPassword);
  };

  // Email Verification Alert Component
  const renderVerificationAlert = () => {
    if (!showVerificationAlert) return null;

    return (
      <Animated.View 
        style={[
          styles.verificationAlert,
          {
            backgroundColor: theme.infoLight,
            borderColor: theme.info + '40',
            transform: [
              {
                translateY: verificationAlertAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [20, 0]
                })
              },
              { scale: verificationAlertAnim }
            ],
            opacity: verificationAlertAnim,
          }
        ]}
      >
        <View style={styles.verificationAlertHeader}>
          <View style={[styles.verificationIcon, { backgroundColor: theme.info + '20' }]}>
            <Ionicons name="mail" size={24} color={theme.info} />
          </View>
          <View style={styles.verificationAlertTitleContainer}>
            <Text style={[styles.verificationAlertTitle, { color: theme.info }]}>
              Email Verification Required
            </Text>
            <Text style={[styles.verificationAlertSubtitle, { color: theme.textSecondary }]}>
              Verify your email to continue
            </Text>
          </View>
          <TouchableOpacity 
            onPress={hideVerificationAlertAnimation}
            style={styles.closeAlertButton}
          >
            <Ionicons name="close" size={20} color={theme.textTertiary} />
          </TouchableOpacity>
        </View>
        
        <Text style={[styles.verificationAlertText, { color: theme.text }]}>
          Your email address needs to be verified before you can access your account. 
          Please check your inbox for the verification email we sent you.
        </Text>
        
        <View style={styles.verificationAlertActions}>
          <TouchableOpacity
            style={[
              styles.verificationAlertButton,
              styles.verificationAlertButtonSecondary,
              { borderColor: theme.border }
            ]}
            onPress={hideVerificationAlertAnimation}
            disabled={isVerificationLoading}
          >
            <Text style={[styles.verificationAlertButtonText, { color: theme.text }]}>
              I'll check later
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[
              styles.verificationAlertButton,
              styles.verificationAlertButtonPrimary,
              { backgroundColor: theme.info }
            ]}
            onPress={handleSendVerificationEmail}
            disabled={isVerificationLoading}
          >
            {isVerificationLoading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="refresh" size={18} color="#fff" />
                <Text style={[styles.verificationAlertButtonText, { color: "#fff", marginLeft: 8 }]}>
                  Resend Email
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
        
        <View style={styles.verificationTips}>
          <Text style={[styles.verificationTipsTitle, { color: theme.textSecondary }]}>
            📌 Tips:
          </Text>
          <View style={styles.verificationTipsList}>
            <View style={styles.verificationTipItem}>
              <Ionicons name="search" size={14} color={theme.textTertiary} />
              <Text style={[styles.verificationTipText, { color: theme.textSecondary }]}>
                Check your spam or junk folder
              </Text>
            </View>
            <View style={styles.verificationTipItem}>
              <Ionicons name="time" size={14} color={theme.textTertiary} />
              <Text style={[styles.verificationTipText, { color: theme.textSecondary }]}>
                Verification links expire in 24 hours
              </Text>
            </View>
            <View style={styles.verificationTipItem}>
              <Ionicons name="checkmark-circle" size={14} color={theme.textTertiary} />
              <Text style={[styles.verificationTipText, { color: theme.textSecondary }]}>
                Click the link in the email to verify
              </Text>
            </View>
          </View>
        </View>
      </Animated.View>
    );
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
        {/* Background Elements */}
        <View style={styles.backgroundContainer}>
          {isDark ? (
            <>
              <Animated.View 
                style={[
                  styles.backgroundCircle,
                  { 
                    backgroundColor: '#1C1C1E',
                    top: '10%',
                    left: '-15%',
                    transform: [{ scale: pulseAnim }]
                  }
                ]} 
              />
              <Animated.View 
                style={[
                  styles.backgroundCircle,
                  { 
                    backgroundColor: '#2C2C2E',
                    bottom: '20%',
                    right: '-10%',
                    transform: [{ scale: pulseAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1, 1.2]
                    }) }]
                  }
                ]} 
              />
            </>
          ) : (
            <>
              <Animated.View 
                style={[
                  styles.backgroundCircle,
                  { 
                    backgroundColor: '#F2F2F7',
                    top: '15%',
                    right: '-5%',
                    transform: [{ scale: pulseAnim }]
                  }
                ]} 
              />
              <Animated.View 
                style={[
                  styles.backgroundCircle,
                  { 
                    backgroundColor: '#F8F9FA',
                    bottom: '25%',
                    left: '-10%',
                    transform: [{ scale: pulseAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1, 1.2]
                    }) }]
                  }
                ]} 
              />
            </>
          )}
        </View>

        <KeyboardAwareScrollView
          contentContainerStyle={styles.scrollContainer}
          enableOnAndroid={true}
          extraScrollHeight={100}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View
            style={[
              styles.container,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            {/* Header Section */}
            <View style={styles.headerSection}>
              <Animated.View
                style={[
                  styles.logoContainer,
                  { 
                    backgroundColor: theme.cardElevated,
                    transform: [{ scale: logoScale }]
                  }
                ]}
              >
                <View style={[styles.logoInner, { backgroundColor: theme.primary + '20' }]}>
                  <MaterialCommunityIcons name="car-connected" size={48} color={theme.primary} />
                </View>
              </Animated.View>

              <View style={styles.titleContainer}>
                <Text style={[styles.title, { color: theme.text }]}>
                  Welcome Back
                </Text>
                <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                  Sign in to access real-time vehicle tracking
                </Text>
              </View>

              {/* Connection Status Indicator */}
              <View style={[
                styles.connectionIndicator,
                { 
                  backgroundColor: isConnected ? theme.success + '20' : theme.error + '20',
                  borderColor: isConnected ? theme.success + '40' : theme.error + '20'
                }
              ]}>
                <Ionicons 
                  name={isConnected ? "wifi" : "cloud-offline"} 
                  size={16} 
                  color={isConnected ? theme.success : theme.error} 
                />
                <Text style={[
                  styles.connectionText,
                  { color: isConnected ? theme.success : theme.error }
                ]}>
                  {isConnected ? 'Online • Ready' : 'Offline • Limited'}
                </Text>
              </View>
            </View>

            {/* Email Verification Alert */}
            {renderVerificationAlert()}

            {/* Form Section */}
            <View style={[styles.formCard, { backgroundColor: theme.card }]}>
              {/* Email Input */}
              <View style={styles.inputWrapper}>
                <Text style={[styles.inputLabel, { color: theme.text }]}>
                  Email Address
                </Text>
                <Animated.View
                  style={[
                    styles.inputContainer,
                    {
                      borderColor: isFocused.email ? theme.primary : theme.border,
                      backgroundColor: theme.cardElevated,
                      transform: [{ translateX: shakeAnim }],
                      borderWidth: isFocused.email ? 2 : 1,
                      shadowColor: isFocused.email ? theme.primary : 'transparent',
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: isFocused.email ? 0.1 : 0,
                      shadowRadius: 4,
                      elevation: isFocused.email ? 2 : 0,
                    },
                  ]}
                >
                  <Ionicons
                    name="mail-outline"
                    size={20}
                    color={isFocused.email ? theme.primary : theme.textTertiary}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    placeholder="Enter your email"
                    placeholderTextColor={theme.textTertiary}
                    value={email}
                    onChangeText={setEmail}
                    style={[styles.input, { color: theme.text }]}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    onFocus={() => setIsFocused({ ...isFocused, email: true })}
                    onBlur={() => setIsFocused({ ...isFocused, email: false })}
                    editable={!isLoading && !isVerificationLoading}
                  />
                  {email.length > 0 && (
                    <TouchableOpacity
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setEmail("");
                      }}
                      style={styles.clearButton}
                      disabled={isLoading || isVerificationLoading}
                    >
                      <Ionicons
                        name="close-circle"
                        size={20}
                        color={theme.textTertiary}
                      />
                    </TouchableOpacity>
                  )}
                </Animated.View>
              </View>

              {/* Password Input */}
              <View style={styles.inputWrapper}>
                <View style={styles.passwordLabelRow}>
                  <Text style={[styles.inputLabel, { color: theme.text }]}>
                    Password
                  </Text>
                  <TouchableOpacity 
                    onPress={handleForgotPassword}
                    disabled={isLoading || isVerificationLoading}
                  >
                    <Text style={[styles.forgotText, { color: theme.primary }]}>
                      Forgot Password?
                    </Text>
                  </TouchableOpacity>
                </View>
                <Animated.View
                  style={[
                    styles.inputContainer,
                    {
                      borderColor: isFocused.password ? theme.primary : theme.border,
                      backgroundColor: theme.cardElevated,
                      transform: [{ translateX: shakeAnim }],
                      borderWidth: isFocused.password ? 2 : 1,
                      shadowColor: isFocused.password ? theme.primary : 'transparent',
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: isFocused.password ? 0.1 : 0,
                      shadowRadius: 4,
                      elevation: isFocused.password ? 2 : 0,
                    },
                  ]}
                >
                  <Ionicons
                    name="lock-closed-outline"
                    size={20}
                    color={isFocused.password ? theme.primary : theme.textTertiary}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    placeholder="Enter your password"
                    placeholderTextColor={theme.textTertiary}
                    value={password}
                    onChangeText={setPassword}
                    style={[styles.input, { color: theme.text }]}
                    secureTextEntry={!showPassword}
                    onFocus={() => setIsFocused({ ...isFocused, password: true })}
                    onBlur={() => setIsFocused({ ...isFocused, password: false })}
                    editable={!isLoading && !isVerificationLoading}
                  />
                  <TouchableOpacity
                    style={styles.eyeIcon}
                    onPress={togglePasswordVisibility}
                    disabled={isLoading || isVerificationLoading}
                  >
                    <Ionicons
                      name={showPassword ? "eye-outline" : "eye-off-outline"}
                      size={22}
                      color={theme.textTertiary}
                    />
                  </TouchableOpacity>
                </Animated.View>
              </View>

              {/* Login Button */}
              <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
                <TouchableOpacity
                  style={[
                    styles.loginButton,
                    {
                      backgroundColor: theme.primary,
                      opacity: (isLoading || !email || !password || isVerificationLoading) ? 0.7 : 1,
                      shadowColor: theme.primary,
                      shadowOffset: { width: 0, height: 6 },
                      shadowOpacity: 0.3,
                      shadowRadius: 12,
                      elevation: 8,
                    },
                  ]}
                  onPress={handleLogin}
                  disabled={isLoading || !email || !password || isVerificationLoading}
                  activeOpacity={0.9}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : isVerificationLoading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Text style={styles.loginButtonText}>Sign In</Text>
                      <Ionicons name="arrow-forward" size={22} color="#fff" />
                    </>
                  )}
                </TouchableOpacity>
              </Animated.View>

              {/* Verification Reminder */}
              <View style={[styles.verificationReminder, { backgroundColor: theme.primary + '10' }]}>
                <Ionicons name="shield-checkmark-outline" size={16} color={theme.primary} />
                <Text style={[styles.verificationReminderText, { color: theme.primary }]}>
                  Email verification required for security To Avoid Spam account.
                </Text>
              </View>

              {/* Divider */}
              <View style={styles.dividerContainer}>
                <View style={[styles.divider, { backgroundColor: theme.borderLight }]} />
                <Text style={[styles.dividerText, { color: theme.textTertiary }]}>
                  New to GPS Tracker?
                </Text>
                <View style={[styles.divider, { backgroundColor: theme.borderLight }]} />
              </View>

              {/* Register Button */}
              <TouchableOpacity
                style={[styles.registerButton, { borderColor: theme.border }]}
                onPress={navigateToRegister}
                disabled={isLoading || isVerificationLoading}
              >
                <Text style={[styles.registerButtonText, { color: theme.text }]}>
                  Create a new account
                </Text>
                <Ionicons name="arrow-forward-circle" size={20} color={theme.text} />
              </TouchableOpacity>

              {/* Features Section */}
              <View style={styles.featuresSection}>
                <Text style={[styles.featuresTitle, { color: theme.textSecondary }]}>
                  Features included:
                </Text>
                <View style={styles.featuresGrid}>
                  <View style={styles.featureItem}>
                    <View style={[styles.featureIcon, { backgroundColor: theme.primary + '10' }]}>
                      <Ionicons name="location" size={18} color={theme.primary} />
                    </View>
                    <Text style={[styles.featureText, { color: theme.text }]}>
                      Real-time GPS
                    </Text>
                  </View>
                  <View style={styles.featureItem}>
                    <View style={[styles.featureIcon, { backgroundColor: theme.success + '10' }]}>
                      <Ionicons name="shield-checkmark" size={18} color={theme.success} />
                    </View>
                    <Text style={[styles.featureText, { color: theme.text }]}>
                      Secure
                    </Text>
                  </View>
                  <View style={styles.featureItem}>
                    <View style={[styles.featureIcon, { backgroundColor: theme.warning + '10' }]}>
                      <Ionicons name="flash" size={18} color={theme.warning} />
                    </View>
                    <Text style={[styles.featureText, { color: theme.text }]}>
                      Fast
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          </Animated.View>
        </KeyboardAwareScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    flexGrow: 1,
  },
  backgroundContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  backgroundCircle: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    opacity: 0.4,
  },
  container: {
    flex: 1,
    minHeight: height,
    paddingHorizontal: 24,
    paddingTop: height * 0.05,
    paddingBottom: 40,
  },
  headerSection: {
    alignItems: "center",
    marginBottom: 40,
  },
  logoContainer: {
    width: 120,
    height: 120,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  logoInner: {
    width: 80,
    height: 80,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleContainer: {
    alignItems: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
    marginBottom: 8,
    textAlign: "center",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: "400",
    textAlign: "center",
    maxWidth: "80%",
    lineHeight: 22,
    opacity: 0.8,
  },
  connectionIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  connectionText: {
    fontSize: 14,
    fontWeight: "600",
    marginLeft: 6,
  },
  verificationAlert: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  verificationAlertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  verificationIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  verificationAlertTitleContainer: {
    flex: 1,
  },
  verificationAlertTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 2,
  },
  verificationAlertSubtitle: {
    fontSize: 14,
    fontWeight: '500',
  },
  closeAlertButton: {
    padding: 4,
  },
  verificationAlertText: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },
  verificationAlertActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 20,
  },
  verificationAlertButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  verificationAlertButtonSecondary: {
    backgroundColor: 'transparent',
  },
  verificationAlertButtonPrimary: {
    borderWidth: 0,
  },
  verificationAlertButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  verificationTips: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
    paddingTop: 16,
  },
  verificationTipsTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  verificationTipsList: {
    gap: 8,
  },
  verificationTipItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  verificationTipText: {
    fontSize: 13,
    flex: 1,
  },
  verificationReminder: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 24,
  },
  verificationReminderText: {
    fontSize: 13,
    fontWeight: '500',
    marginLeft: 8,
  },
  formCard: {
    borderRadius: 24,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 5,
  },
  inputWrapper: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 8,
    letterSpacing: -0.2,
  },
  passwordLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  forgotText: {
    fontSize: 14,
    fontWeight: "600",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 56,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontWeight: "400",
    height: "100%",
  },
  clearButton: {
    padding: 4,
  },
  eyeIcon: {
    padding: 4,
    marginLeft: 8,
  },
  loginButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 56,
    borderRadius: 16,
    marginBottom: 16,
  },
  loginButtonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
    marginRight: 8,
    letterSpacing: 0.5,
  },
  dividerContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
  },
  divider: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    paddingHorizontal: 16,
    fontSize: 14,
    fontWeight: "500",
  },
  registerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 24,
  },
  registerButtonText: {
    fontSize: 15,
    fontWeight: "600",
    marginRight: 8,
  },
  featuresSection: {
    marginBottom: 20,
  },
  featuresTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 16,
    textAlign: "center",
  },
  featuresGrid: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  featureItem: {
    alignItems: "center",
    flex: 1,
  },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  featureText: {
    fontSize: 12,
    fontWeight: "500",
    textAlign: "center",
  },
});