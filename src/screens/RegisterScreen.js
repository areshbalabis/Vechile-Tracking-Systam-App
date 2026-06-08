import React, { useState, useEffect, useRef } from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  useColorScheme,
  Animated,
  Dimensions,
  StatusBar,
  Pressable,
  Modal,
  Linking,
} from "react-native";
import { createUserWithEmailAndPassword, sendEmailVerification } from "firebase/auth";
import { auth } from "../firebase";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import NetInfo from "@react-native-community/netinfo";
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import * as NavigationBar from "expo-navigation-bar";
import * as Haptics from 'expo-haptics';
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle } from 'react-native-svg';

const { width, height } = Dimensions.get('window');

export default function RegisterScreen({ navigation }) {
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    confirmPassword: ""
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isConnected, setIsConnected] = useState(true);
  const [loading, setLoading] = useState(false);
  const [emailVerifying, setEmailVerifying] = useState(false);
  const [errors, setErrors] = useState({});
  const [isFocused, setIsFocused] = useState({
    email: false,
    password: false,
    confirmPassword: false
  });
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [emailToVerify, setEmailToVerify] = useState("");
  const [isEmailSent, setIsEmailSent] = useState(false);
  const [canResendEmail, setCanResendEmail] = useState(true);
  const [resendTimer, setResendTimer] = useState(0);
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [userCreated, setUserCreated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  const scheme = useColorScheme();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const emailVerifiedAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    StatusBar.setHidden(true, "slide");
    NavigationBar.setVisibilityAsync("hidden");
    NavigationBar.setBehaviorAsync("overlay-swipe");

    return () => {
      StatusBar.setHidden(false, "slide");
      NavigationBar.setVisibilityAsync("visible");
    };
  }, []);

  // Animation on mount
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
        delay: 100,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 50,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // Animation when email is verified
  useEffect(() => {
    if (isEmailVerified) {
      Animated.sequence([
        Animated.timing(emailVerifiedAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(emailVerifiedAnim, {
          toValue: 0.8,
          tension: 200,
          friction: 5,
          useNativeDriver: true,
        }),
        Animated.spring(emailVerifiedAnim, {
          toValue: 1,
          tension: 200,
          friction: 5,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isEmailVerified]);

  // Resend timer effect
  useEffect(() => {
    let interval;
    if (resendTimer > 0) {
      interval = setInterval(() => {
        setResendTimer((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            setCanResendEmail(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [resendTimer]);

  // Internet status
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsConnected(state.isConnected);
      if (!state.isConnected) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
    });
    return () => unsubscribe();
  }, []);

  // Shake animation for errors
  const triggerShake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, {
        toValue: 10,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: -10,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 10,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 0,
        duration: 50,
        useNativeDriver: true,
      }),
    ]).start();
  };

  // Handle input changes with haptics
  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: "" }));
    }
    if (field === 'password' && value.length > 0) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    // Reset email verification if email changes
    if (field === 'email') {
      setIsEmailVerified(false);
      setUserCreated(false);
    }
  };

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

  // Validation functions
  const validateEmail = (email) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  };

  // Check for disposable email domains
  const checkDisposableEmail = (email) => {
    const disposableDomains = [
      'tempmail.com', 'mailinator.com', 'guerrillamail.com', 'sharklasers.com',
      'trashmail.com', '10minutemail.com', 'throwawaymail.com', 'yopmail.com',
      'fakeinbox.com', 'spam4.me', 'dispostable.com', 'maildrop.cc'
    ];
    
    const domain = email.split('@')[1].toLowerCase();
    return disposableDomains.some(d => domain.includes(d));
  };

  // Validate email format and disposable status
  const validateEmailExistence = (email) => {
    if (!validateEmail(email)) {
      return { isValid: false, message: "Please enter a valid email address" };
    }

    if (checkDisposableEmail(email)) {
      return { isValid: false, message: "Please use a permanent email address" };
    }

    // Check for common email provider domains
    const validDomains = [
      'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com',
      'icloud.com', 'aol.com', 'protonmail.com', 'zoho.com',
      'mail.com', 'yandex.com', 'gmx.com'
    ];
    
    const domain = email.split('@')[1].toLowerCase();
    if (!validDomains.some(d => domain.includes(d))) {
      // Not a common domain, show warning but allow
      return { 
        isValid: true, 
        message: "⚠️ Unusual email domain detected", 
        warning: true 
      };
    }

    return { isValid: true, message: "✓ Valid email format", warning: false };
  };

  // Send verification email using Firebase's built-in email verification
  const sendVerificationEmail = async (email, password) => {
    try {
      setEmailVerifying(true);
      
      // Create user account first
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      setCurrentUser(user);
      setUserCreated(true);
      
      // Send verification email using Firebase's default email verification
      await sendEmailVerification(user);
      
      setEmailToVerify(email);
      setShowVerificationModal(true);
      setIsEmailSent(true);
      
      // Start resend timer (60 seconds)
      setCanResendEmail(false);
      setResendTimer(60);
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
      return true;
    } catch (error) {
      console.error("Error sending verification email:", error);
      
      let errorMessage = "Failed to send verification email. Please try again.";
      if (error.code === 'auth/email-already-in-use') {
        errorMessage = "This email is already registered. Please sign in instead.";
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = "Please enter a valid email address.";
      } else if (error.code === 'auth/operation-not-allowed') {
        errorMessage = "Email verification is not enabled. Please contact support.";
      } else if (error.code === 'auth/network-request-failed') {
        errorMessage = "Network error. Please check your internet connection.";
      } else if (error.code === 'auth/weak-password') {
        errorMessage = "Password is too weak. Please choose a stronger password.";
      }
      
      Alert.alert("Error", errorMessage);
      return false;
    } finally {
      setEmailVerifying(false);
    }
  };

  // Resend verification email
  const resendVerificationEmail = async () => {
    if (!canResendEmail || resendTimer > 0) return;
    
    try {
      setCanResendEmail(false);
      setResendTimer(60);
      
      if (currentUser) {
        await sendEmailVerification(currentUser);
        
        Alert.alert("✅ Email Resent", "A new verification email has been sent to your email address.");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      console.error("Error resending verification email:", error);
      Alert.alert("Error", "Failed to resend verification email. Please try again.");
      setCanResendEmail(true);
    }
  };

  // Check if email is verified
  const checkEmailVerification = async () => {
    try {
      const user = currentUser || auth.currentUser;
      if (user) {
        // Reload user to get latest email verification status
        await user.reload();
        
        if (user.emailVerified) {
          setIsEmailVerified(true);
          
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          
          Alert.alert(
            "✅ Email Verified!",
            "Your email has been verified successfully. You can now complete your registration.",
            [
              {
                text: "Continue",
                onPress: () => {
                  setShowVerificationModal(false);
                }
              }
            ]
          );
          return true;
        } else {
          Alert.alert(
            "Email Not Verified",
            "Please click the verification link in your email and try again.",
            [
              {
                text: "Open Email",
                onPress: () => Linking.openURL('mailto:')
              },
              {
                text: "Try Again",
                onPress: () => checkEmailVerification()
              }
            ]
          );
          return false;
        }
      }
      return false;
    } catch (error) {
      console.error("Error checking email verification:", error);
      Alert.alert("Error", "Failed to check email verification status. Please try again.");
      return false;
    }
  };

  // Validate password
  const validatePassword = (password) => {
    if (password.length < 6) {
      return "Password must be at least 6 characters";
    }
    if (!/(?=.*[A-Z])/.test(password)) {
      return "Password must contain at least one uppercase letter";
    }
    if (!/(?=.*\d)/.test(password)) {
      return "Password must contain at least one number";
    }
    return "";
  };

  // Form validation
  const validateForm = () => {
    const newErrors = {};

    if (!formData.email) {
      newErrors.email = "Email is required";
    } else if (!validateEmail(formData.email)) {
      newErrors.email = "Please enter a valid email address";
    } else if (!isEmailVerified) {
      newErrors.email = "Please verify your email address first";
    }

    const passwordError = validatePassword(formData.password);
    if (passwordError) {
      newErrors.password = passwordError;
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = "Please confirm your password";
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match";
    }

    setErrors(newErrors);
    
    if (Object.keys(newErrors).length > 0) {
      triggerShake();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
    
    return Object.keys(newErrors).length === 0;
  };

  // Handle the main button click (Verify Email First / Complete Registration)
  const handleMainButton = async () => {
    if (loading || emailVerifying) return;

    animateButtonPress();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (!isEmailVerified) {
      // Step 1: Verify Email
      
      // Validate email first
      const emailValidation = validateEmailExistence(formData.email);
      if (!emailValidation.isValid) {
        setErrors(prev => ({ ...prev, email: emailValidation.message }));
        triggerShake();
        return;
      }

      // Validate password first
      const passwordError = validatePassword(formData.password);
      if (passwordError) {
        setErrors(prev => ({ ...prev, password: passwordError }));
        triggerShake();
        return;
      }

      // Validate confirm password
      if (!formData.confirmPassword) {
        setErrors(prev => ({ ...prev, confirmPassword: "Please confirm your password" }));
        triggerShake();
        return;
      } else if (formData.password !== formData.confirmPassword) {
        setErrors(prev => ({ ...prev, confirmPassword: "Passwords do not match" }));
        triggerShake();
        return;
      }

      if (!isConnected) {
        Alert.alert(
          "No Internet Connection",
          "Please check your network connection to register.",
          [{ text: "OK", onPress: () => Haptics.selectionAsync() }]
        );
        return;
      }

      setLoading(true);
      
      // Send verification email
      const sent = await sendVerificationEmail(formData.email, formData.password);
      
      setLoading(false);
    } else {
      // Step 2: Complete Registration (Email already verified)
      
      if (!validateForm()) {
        return;
      }

      if (!isConnected) {
        Alert.alert(
          "No Internet Connection",
          "Please check your network connection to register.",
          [{ text: "OK", onPress: () => Haptics.selectionAsync() }]
        );
        return;
      }

      setLoading(true);

      try {
        // User is already created and email is verified
        // We just need to show success message and redirect to login
        
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        
        Alert.alert(
          "🎉 Registration Successful!",
          "Your passenger account has been created and verified successfully!",
          [
            {
              onPress: () => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                navigation.replace("Home", { 
                  message: "Your account is verifed!" 
                });
              },
            },
          ]
        );
      } catch (error) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        
        let errorMessage = "Registration failed. Please try again.";
        
        switch (error.code) {
          case "auth/email-already-in-use":
            errorMessage = "This email is already registered. Please sign in instead.";
            break;
          case "auth/invalid-email":
            errorMessage = "Please enter a valid email address.";
            break;
          case "auth/weak-password":
            errorMessage = "Password is too weak. Please choose a stronger password.";
            break;
          case "auth/network-request-failed":
            errorMessage = "Network error. Please check your connection.";
            break;
        }
        
        Alert.alert("Registration Failed", errorMessage, [
          { text: "Try Again", onPress: () => Haptics.selectionAsync() }
        ]);
      } finally {
        setLoading(false);
      }
    }
  };

  const isDark = scheme === "dark";
  const theme = isDark ? darkTheme : lightTheme;

  // Password strength indicator
  const getPasswordStrength = (password) => {
    if (!password) return { strength: 0, label: "", color: theme.border };
    
    let score = 0;
    if (password.length >= 6) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[!@#$%^&*]/.test(password)) score++;
    if (password.length >= 10) score++;
    
    const strengths = [
      { label: "Very Weak", color: "#FF3B30" },
      { label: "Weak", color: "#FF9500" },
      { label: "Fair", color: "#FFCC00" },
      { label: "Good", color: "#34C759" },
      { label: "Strong", color: "#32D74B" },
      { label: "Very Strong", color: "#30D158" }
    ];
    
    return strengths[Math.min(score, 5)];
  };

  const passwordStrength = getPasswordStrength(formData.password);

  // Custom SVG Logo for Passenger Registration
  const PassengerLogo = () => (
    <Svg width="80" height="80" viewBox="0 0 80 80" fill="none">
      <Circle cx="40" cy="40" r="36" fill={theme.primary} />
      {/* Person silhouette */}
      <Circle cx="40" cy="25" r="10" fill="#FFFFFF" />
      <Path 
        d="M25 45C25 36.7157 31.7157 30 40 30C48.2843 30 55 36.7157 55 45V55H25V45Z" 
        fill="#FFFFFF" 
      />
      {/* Suitcase/Icon */}
      <Path 
        d="M30 55V60C30 61.6569 31.3431 63 33 63H47C48.6569 63 50 61.6569 50 60V55"
        stroke="#FFFFFF"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <Path 
        d="M35 48L45 48"
        stroke="#FFFFFF"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </Svg>
  );

  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'left', 'right']}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor="transparent" translucent />
        
        <LinearGradient
          colors={[theme.gradientStart, theme.gradientEnd]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
        
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
        >
          <ScrollView 
            contentContainerStyle={styles.scrollContainer}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            bounces={false}
          >
            <Animated.View
              style={[
                styles.container,
                { 
                  opacity: fadeAnim,
                  transform: [{ translateY: slideAnim }]
                }
              ]}
            >
              {/* Header Section */}
              <View style={styles.headerSection}>
                <View style={[styles.logoContainer, { backgroundColor: theme.logoBg }]}>
                  <LinearGradient
                    colors={[theme.primary, theme.secondary]}
                    style={styles.logoGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  >
                    <PassengerLogo />
                  </LinearGradient>
                </View>
                <MaskedView
                  style={styles.titleContainer}
                  maskElement={
                    <Text style={[styles.title, { color: theme.text }]}>
                      Hello
                    </Text>
                  }
                >
                  <LinearGradient
                    colors={[theme.primary, theme.secondary]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={StyleSheet.absoluteFill}
                  />
                </MaskedView>
                <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                  Create your passenger account
                </Text>
              </View>

              <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
                {/* Form Section */}
                <View style={styles.formSection}>
                  {/* Email Input */}
                  <View style={styles.inputWrapper}>
                    <View style={styles.labelContainer}>
                      <MaterialCommunityIcons 
                        name="email-outline" 
                        size={18} 
                        color={theme.primary} 
                        style={{ marginRight: 8 }}
                      />
                      <Text style={[styles.inputLabel, { color: theme.text }]}>
                        Email Address
                      </Text>
                      <View style={[styles.requiredDot, { backgroundColor: theme.primary }]} />
                      {isEmailVerified && (
                        <Animated.View 
                          style={[
                            styles.verifiedBadge,
                            { transform: [{ scale: emailVerifiedAnim }] }
                          ]}
                        >
                          <Ionicons name="checkmark-circle" size={16} color="#30D158" />
                          <Text style={styles.verifiedText}>Verified</Text>
                        </Animated.View>
                      )}
                    </View>
                    <View
                      style={[
                        styles.inputContainer,
                        {
                          borderColor: errors.email 
                            ? "#FF3B30" 
                            : isFocused.email 
                            ? theme.primary 
                            : 'transparent',
                          backgroundColor: theme.inputBg,
                          shadowColor: errors.email ? "#FF3B30" : theme.primary,
                          shadowOpacity: isFocused.email || errors.email ? 0.2 : 0,
                        },
                      ]}
                    >
                      <Ionicons
                        name="mail-outline"
                        size={22}
                        color={
                          errors.email 
                            ? "#FF3B30"
                            : isFocused.email 
                            ? theme.primary 
                            : theme.placeholder
                        }
                        style={styles.inputIcon}
                      />
                      <TextInput
                        placeholder="passenger@example.com"
                        placeholderTextColor={theme.placeholder}
                        value={formData.email}
                        onChangeText={(text) => handleInputChange("email", text)}
                        style={[styles.input, { color: theme.text }]}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoCorrect={false}
                        onFocus={() => {
                          setIsFocused({ ...isFocused, email: true });
                          Haptics.selectionAsync();
                        }}
                        onBlur={() => setIsFocused({ ...isFocused, email: false })}
                        editable={!loading && !emailVerifying}
                      />
                      {formData.email.length > 0 && !errors.email && validateEmail(formData.email) && (
                        <Ionicons
                          name="checkmark-circle"
                          size={20}
                          color={theme.primary}
                          style={styles.checkIcon}
                        />
                      )}
                    </View>
                    {errors.email && (
                      <View style={styles.errorContainer}>
                        <Ionicons name="alert-circle" size={14} color="#FF3B30" />
                        <Text style={styles.errorText}>{errors.email}</Text>
                      </View>
                    )}
                    {formData.email.length > 0 && validateEmail(formData.email) && !errors.email && !isEmailVerified && (
                      <View style={styles.warningContainer}>
                        <Ionicons name="information-circle" size={14} color="#FF9500" />
                        <Text style={styles.warningText}>
                          Email verification required before registration
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Password Input */}
                  <View style={styles.inputWrapper}>
                    <View style={styles.labelContainer}>
                      <MaterialCommunityIcons 
                        name="lock-outline" 
                        size={18} 
                        color={theme.primary} 
                        style={{ marginRight: 8 }}
                      />
                      <Text style={[styles.inputLabel, { color: theme.text }]}>
                        Secure Password
                      </Text>
                      <View style={[styles.requiredDot, { backgroundColor: theme.primary }]} />
                    </View>
                    <View
                      style={[
                        styles.inputContainer,
                        {
                          borderColor: errors.password 
                            ? "#FF3B30" 
                            : isFocused.password 
                            ? theme.primary 
                            : 'transparent',
                          backgroundColor: theme.inputBg,
                          shadowColor: errors.password ? "#FF3B30" : theme.primary,
                          shadowOpacity: isFocused.password || errors.password ? 0.2 : 0,
                        },
                      ]}
                    >
                      <Ionicons
                        name="lock-closed-outline"
                        size={22}
                        color={
                          errors.password 
                            ? "#FF3B30"
                            : isFocused.password 
                            ? theme.primary 
                            : theme.placeholder
                        }
                        style={styles.inputIcon}
                      />
                      <TextInput
                        placeholder="Create a secure password"
                        placeholderTextColor={theme.placeholder}
                        value={formData.password}
                        onChangeText={(text) => handleInputChange("password", text)}
                        style={[styles.input, { color: theme.text }]}
                        secureTextEntry={!showPassword}
                        onFocus={() => {
                          setIsFocused({ ...isFocused, password: true });
                          Haptics.selectionAsync();
                        }}
                        onBlur={() => setIsFocused({ ...isFocused, password: false })}
                        editable={!loading}
                      />
                      <Pressable
                        style={styles.eyeIcon}
                        onPress={() => {
                          setShowPassword(!showPassword);
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        }}
                        disabled={loading}
                      >
                        <Ionicons
                          name={showPassword ? "eye-outline" : "eye-off-outline"}
                          size={24}
                          color={theme.placeholder}
                        />
                      </Pressable>
                    </View>
                    
                    {/* Password Strength Indicator */}
                    {formData.password.length > 0 && (
                      <View style={styles.strengthContainer}>
                        <LinearGradient
                          colors={['#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#32D74B']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={[styles.strengthBarBackground, { opacity: 0.2 }]}
                        />
                        <View 
                          style={[
                            styles.strengthBarFill,
                            { 
                              width: `${(passwordStrength.strength + 1) * 20}%`,
                              backgroundColor: passwordStrength.color,
                            }
                          ]}
                        />
                        <Text style={[styles.strengthText, { color: passwordStrength.color }]}>
                          {passwordStrength.label}
                        </Text>
                      </View>
                    )}
                    
                    {/* Password Requirements */}
                    <View style={[styles.requirementsContainer, { backgroundColor: theme.cardBg }]}>
                      <Text style={[styles.requirementsTitle, { color: theme.text }]}>
                        Password Security Level
                      </Text>
                      {[
                        { text: "At least 6 characters", check: formData.password.length >= 6 },
                        { text: "One uppercase letter", check: /[A-Z]/.test(formData.password) },
                        { text: "One number", check: /\d/.test(formData.password) },
                        { text: "One special character (optional)", check: /[!@#$%^&*]/.test(formData.password) },
                      ].map((req, index) => (
                        <View key={index} style={styles.requirementItem}>
                          <Ionicons
                            name={req.check ? "checkmark-circle" : "ellipse-outline"}
                            size={16}
                            color={req.check ? "#34C759" : theme.textSecondary}
                          />
                          <Text style={[
                            styles.requirementText, 
                            { 
                              color: req.check ? theme.text : theme.textSecondary,
                              textDecorationLine: req.check ? 'none' : 'line-through',
                              opacity: req.check ? 1 : 0.6
                            }
                          ]}>
                            {req.text}
                          </Text>
                        </View>
                      ))}
                    </View>
                    
                    {errors.password && (
                      <View style={styles.errorContainer}>
                        <Ionicons name="alert-circle" size={14} color="#FF3B30" />
                        <Text style={styles.errorText}>{errors.password}</Text>
                      </View>
                    )}
                  </View>

                  {/* Confirm Password Input */}
                  <View style={styles.inputWrapper}>
                    <View style={styles.labelContainer}>
                      <MaterialCommunityIcons 
                        name="lock-check-outline" 
                        size={18} 
                        color={theme.primary} 
                        style={{ marginRight: 8 }}
                      />
                      <Text style={[styles.inputLabel, { color: theme.text }]}>
                        Confirm Password
                      </Text>
                      <View style={[styles.requiredDot, { backgroundColor: theme.primary }]} />
                    </View>
                    <View
                      style={[
                        styles.inputContainer,
                        {
                          borderColor: errors.confirmPassword 
                            ? "#FF3B30" 
                            : isFocused.confirmPassword 
                            ? theme.primary 
                            : 'transparent',
                          backgroundColor: theme.inputBg,
                          shadowColor: errors.confirmPassword ? "#FF3B30" : theme.primary,
                          shadowOpacity: isFocused.confirmPassword || errors.confirmPassword ? 0.2 : 0,
                        },
                      ]}
                    >
                      <Ionicons
                        name="lock-closed-outline"
                        size={22}
                        color={
                          errors.confirmPassword 
                            ? "#FF3B30"
                            : isFocused.confirmPassword 
                            ? theme.primary 
                            : theme.placeholder
                        }
                        style={styles.inputIcon}
                      />
                      <TextInput
                        placeholder="Re-enter your password"
                        placeholderTextColor={theme.placeholder}
                        value={formData.confirmPassword}
                        onChangeText={(text) => handleInputChange("confirmPassword", text)}
                        style={[styles.input, { color: theme.text }]}
                        secureTextEntry={!showConfirmPassword}
                        onFocus={() => {
                          setIsFocused({ ...isFocused, confirmPassword: true });
                          Haptics.selectionAsync();
                        }}
                        onBlur={() => setIsFocused({ ...isFocused, confirmPassword: false })}
                        editable={!loading}
                      />
                      <Pressable
                        style={styles.eyeIcon}
                        onPress={() => {
                          setShowConfirmPassword(!showConfirmPassword);
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        }}
                        disabled={loading}
                      >
                        <Ionicons
                          name={showConfirmPassword ? "eye-outline" : "eye-off-outline"}
                          size={24}
                          color={theme.placeholder}
                        />
                      </Pressable>
                    </View>
                    {errors.confirmPassword && (
                      <View style={styles.errorContainer}>
                        <Ionicons name="alert-circle" size={14} color="#FF3B30" />
                        <Text style={styles.errorText}>{errors.confirmPassword}</Text>
                      </View>
                    )}
                  </View>

                  {/* Connection Status */}
                  {!isConnected && (
                    <View style={styles.offlineBanner}>
                      <MaterialCommunityIcons name="wifi-off" size={22} color="#fff" />
                      <Text style={styles.offlineText}>
                        No internet connection. Registration requires active internet.
                      </Text>
                    </View>
                  )}

                  {/* Journey Info */}
                  <View style={[styles.journeyInfo, { backgroundColor: theme.cardBg }]}>
                    <MaterialCommunityIcons name="map-marker-outline" size={24} color={theme.primary} />
                    <View style={styles.journeyInfoContent}>
                      <Text style={[styles.journeyInfoTitle, { color: theme.text }]}>
                        Ready to Travel?
                      </Text>
                      <Text style={[styles.journeyInfoText, { color: theme.textSecondary }]}>
                        {isEmailVerified 
                          ? "✓ Email verified! Complete your registration to start your journey."
                          : "Fill in all fields and click 'Verify Email First' to start the verification process."
                        }
                      </Text>
                    </View>
                  </View>

                  {/* Main Action Button */}
                  <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
                    <Pressable
                      style={({ pressed }) => [
                        styles.registerButton,
                        {
                          backgroundColor: theme.primary,
                          opacity: (loading || emailVerifying) ? 0.7 : pressed ? 0.9 : 1,
                        },
                      ]}
                      onPress={handleMainButton}
                      disabled={loading || emailVerifying}
                    >
                      <LinearGradient
                        colors={[theme.primary, theme.secondary]}
                        style={styles.buttonGradient}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                      >
                        {loading || emailVerifying ? (
                          <ActivityIndicator color="#fff" size="small" />
                        ) : (
                          <>
                            <MaterialCommunityIcons 
                              name={isEmailVerified ? "account-check" : "email-check"} 
                              size={24} 
                              color="#fff" 
                            />
                            <Text style={styles.registerButtonText}>
                              {isEmailVerified ? "Complete Registration" : "Verify Email First"}
                            </Text>
                            <MaterialCommunityIcons name="arrow-right" size={24} color="#fff" />
                          </>
                        )}
                      </LinearGradient>
                    </Pressable>
                  </Animated.View>

                  {/* Divider */}
                  <View style={styles.dividerContainer}>
                    <View style={[styles.divider, { backgroundColor: theme.border }]} />
                    <Text style={[styles.dividerText, { color: theme.textSecondary }]}>
                      Already a passenger?
                    </Text>
                    <View style={[styles.divider, { backgroundColor: theme.border }]} />
                  </View>

                  {/* Login Button */}
                  <Pressable
                    style={({ pressed }) => [
                      styles.loginButton, 
                      { 
                        borderColor: theme.primary,
                        opacity: pressed ? 0.7 : 1,
                      }
                    ]}
                    onPress={() => {
                      navigation.navigate("Login");
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                    disabled={loading || emailVerifying}
                  >
                    <MaterialCommunityIcons name="login" size={20} color={theme.primary} />
                    <Text style={[styles.loginButtonText, { color: theme.primary }]}>
                      Sign In to Your Account
                    </Text>
                  </Pressable>
                </View>
              </Animated.View>

              {/* Footer */}
              <View style={styles.footer}>
                <View style={styles.footerIcons}>
                  <MaterialCommunityIcons name="shield-check-outline" size={16} color={theme.primary} />
                  <Text style={[styles.footerText, { color: theme.textSecondary, marginLeft: 6 }]}>
                    Secure Registration with Email Verification
                  </Text>
                </View>
              </View>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Email Verification Modal */}
        <Modal
          visible={showVerificationModal}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setShowVerificationModal(false)}
          statusBarTranslucent
        >
          <View style={styles.modalOverlay}>
            <Pressable 
              style={styles.modalBackground}
              onPress={() => setShowVerificationModal(false)}
            />
            <Animated.View 
              style={[
                styles.modalContent,
                { 
                  backgroundColor: theme.cardBg,
                  shadowColor: theme.primary,
                }
              ]}
            >
              {/* Modal Header */}
              <View style={styles.modalHeader}>
                <View style={[styles.modalIconContainer, { backgroundColor: `${theme.primary}20` }]}>
                  <Ionicons name={isEmailSent ? "mail" : "mail-alert"} size={36} color={isEmailSent ? "#30D158" : theme.primary} />
                </View>
                <Text style={[styles.modalTitle, { color: theme.text }]}>
                  {isEmailSent ? "Check Your Email" : "Email Verification"}
                </Text>
                <Text style={[styles.modalSubtitle, { color: theme.textSecondary }]}>
                  {isEmailSent 
                    ? "We've sent a verification link to:"
                    : "Please verify your email address to continue"}
                </Text>
                <Text style={[styles.modalEmail, { color: theme.primary, fontWeight: "600" }]}>
                  {emailToVerify}
                </Text>
              </View>

              {/* Instructions */}
              {isEmailSent && (
                <>
                  <View style={styles.instructionsContainer}>
                    <Text style={[styles.instructionsTitle, { color: theme.text }]}>
                      📧 Follow these steps:
                    </Text>
                    
                    <View style={styles.instructionStep}>
                      <View style={[styles.stepNumber, { backgroundColor: theme.primary }]}>
                        <Text style={styles.stepNumberText}>1</Text>
                      </View>
                      <Text style={[styles.stepText, { color: theme.text }]}>
                        Open your email inbox or spam
                      </Text>
                    </View>
                    
                    <View style={styles.instructionStep}>
                      <View style={[styles.stepNumber, { backgroundColor: theme.primary }]}>
                        <Text style={styles.stepNumberText}>2</Text>
                      </View>
                      <Text style={[styles.stepText, { color: theme.text }]}>
                        Look for email from <Text style={{ fontWeight: 'bold' }}>noreply@mydrivers-32f27.firebaseapp.com</Text>
                      </Text>
                    </View>

                    <View style={styles.instructionStep}>
                      <View style={[styles.stepNumber, { backgroundColor: theme.primary }]}>
                        <Text style={styles.stepNumberText}>4</Text>
                      </View>
                      <Text style={[styles.stepText, { color: theme.text }]}>
                        Return to this app and click "I've Verified My Email"
                      </Text>
                    </View>
                  </View>
                  <View style={styles.modalButtons}>
                    <Pressable
                      style={[styles.modalButton, styles.modalButtonPrimary, { 
                        backgroundColor: theme.success || "#30D158",
                      }]}
                      onPress={checkEmailVerification}
                      disabled={loading}
                    >
                      <LinearGradient
                        colors={["#30D158", "#34C759"]}
                        style={styles.modalButtonGradient}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                      >
                        {loading ? (
                          <ActivityIndicator color="#fff" size="small" />
                        ) : (
                          <>
                            <Ionicons name="checkmark-circle" size={20} color="#fff" />
                            <Text style={styles.modalButtonTextPrimary}>
                              I've Verified My Email
                            </Text>
                          </>
                        )}
                      </LinearGradient>
                    </Pressable>
                  </View>
                  <Pressable
                    style={styles.resendButton}
                    onPress={resendVerificationEmail}
                    disabled={!canResendEmail}
                  >
                    <Ionicons 
                      name="refresh" 
                      size={18} 
                      color={canResendEmail ? theme.primary : theme.textTertiary} 
                    />
                    <Text style={[
                      styles.resendText, 
                      { 
                        color: canResendEmail ? theme.primary : theme.textTertiary,
                        marginLeft: 8
                      }
                    ]}>
                      {canResendEmail 
                        ? "Resend verification email" 
                        : `Resend available in ${resendTimer}s`
                      }
                    </Text>
                  </Pressable>

                  <Text style={[styles.noteText, { color: theme.textTertiary }]}>
                    Note: The verification link Porpose is for Security only.
                  </Text>
                </>
              )}
            </Animated.View>
          </View>
        </Modal>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

// 🎨 THEME - Transportation/Passenger Focused
const lightTheme = {
  background: "#FFFFFF",
  gradientStart: "#FFFFFF",
  gradientEnd: "#F0F7FF",
  text: "#1A1A1A",
  textSecondary: "#666666",
  textTertiary: "#8E8E93",
  inputBg: "#FFFFFF",
  cardBg: "#F8FAFF",
  primary: "#2563EB", // Blue for transportation/trust
  secondary: "#3B82F6", // Lighter blue
  placeholder: "#8E8E93",
  border: "rgba(37, 99, 235, 0.1)",
  icon: "#2563EB",
  logoBg: "#FFFFFF",
  shadow: "rgba(37, 99, 235, 0.1)",
  success: "#30D158",
};

const darkTheme = {
  background: "#0F172A",
  gradientStart: "#0F172A",
  gradientEnd: "#1E293B",
  text: "#F8FAFC",
  textSecondary: "#94A3B8",
  textTertiary: "#64748B",
  inputBg: "#1E293B",
  cardBg: "#334155",
  primary: "#60A5FA", // Softer blue for dark mode
  secondary: "#3B82F6",
  placeholder: "#64748B",
  border: "rgba(96, 165, 250, 0.2)",
  icon: "#60A5FA",
  logoBg: "#1E293B",
  shadow: "rgba(96, 165, 250, 0.2)",
  success: "#30D158",
};

const styles = StyleSheet.create({
  scrollContainer: {
    flexGrow: 1,
  },
  container: {
    flex: 1,
    minHeight: height,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 40,
  },
  headerSection: {
    alignItems: "center",
    marginTop: height * 0.05,
    marginBottom: 40,
  },
  logoContainer: {
    width: 120,
    height: 120,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 32,
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 10,
    overflow: 'hidden',
  },
  logoGradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleContainer: {
    height: 60,
    justifyContent: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 36,
    fontWeight: "800",
    textAlign: "center",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: "500",
    textAlign: "center",
    maxWidth: "80%",
    lineHeight: 22,
    opacity: 0.8,
  },
  formSection: {
    marginBottom: 30,
  },
  inputWrapper: {
    marginBottom: 28,
  },
  labelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: "600",
    marginRight: 8,
  },
  requiredDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  emailInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  emailInputContainer: {
    flex: 1,
    marginRight: 12,
  },
  verifyButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 80,
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  verifyButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#30D15820',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 8,
  },
  verifiedText: {
    color: '#30D158',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  warningContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingLeft: 4,
  },
  warningText: {
    color: "#FF9500",
    fontSize: 14,
    marginLeft: 8,
    fontWeight: "500",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    paddingHorizontal: 20,
    height: 60,
    borderWidth: 2,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 4,
  },
  inputIcon: {
    marginRight: 16,
  },
  checkIcon: {
    marginLeft: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontWeight: "500",
    height: "100%",
    letterSpacing: 0.5,
  },
  eyeIcon: {
    padding: 8,
    marginLeft: 8,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingLeft: 4,
  },
  errorText: {
    color: "#FF3B30",
    fontSize: 14,
    marginLeft: 8,
    fontWeight: "500",
  },
  strengthContainer: {
    height: 6,
    borderRadius: 3,
    marginTop: 16,
    marginBottom: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  strengthBarBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 3,
  },
  strengthBarFill: {
    height: '100%',
    borderRadius: 3,
    position: 'absolute',
    top: 0,
    left: 0,
  },
  strengthText: {
    fontSize: 14,
    fontWeight: "700",
    marginTop: 8,
  },
  requirementsContainer: {
    marginTop: 16,
    padding: 20,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  requirementsTitle: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 16,
    letterSpacing: 0.5,
  },
  requirementItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  requirementText: {
    fontSize: 14,
    marginLeft: 12,
    fontWeight: "500",
    flex: 1,
  },
  offlineBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FF9500",
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    shadowColor: "#FF9500",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  offlineText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
    marginLeft: 12,
    flex: 1,
    letterSpacing: 0.3,
  },
  journeyInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderRadius: 16,
    marginBottom: 24,
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  journeyInfoContent: {
    flex: 1,
    marginLeft: 16,
  },
  journeyInfoTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 4,
  },
  journeyInfoText: {
    fontSize: 14,
    opacity: 0.8,
    lineHeight: 20,
  },
  registerButton: {
    height: 64,
    borderRadius: 20,
    marginBottom: 20,
    overflow: 'hidden',
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 12,
  },
  buttonGradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  registerButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  dividerContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
    marginTop: 8,
  },
  divider: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    paddingHorizontal: 16,
    fontSize: 14,
    fontWeight: "600",
    opacity: 0.7,
  },
  loginButton: {
    height: 60,
    borderRadius: 16,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: 'row',
    paddingHorizontal: 32,
    gap: 12,
  },
  loginButtonText: {
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  footer: {
    marginTop: 32,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  footerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  footerText: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    opacity: 0.8,
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 30,
    paddingBottom: 40,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 20,
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: 30,
  },
  modalIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  modalSubtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 22,
  },
  modalEmail: {
    fontSize: 18,
    textAlign: 'center',
    marginTop: 4,
  },
  // New styles for instructions
  instructionsContainer: {
    marginBottom: 20,
  },
  instructionsTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 20,
    textAlign: 'center',
  },
  instructionStep: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  stepNumberText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  stepText: {
    fontSize: 15,
    flex: 1,
    lineHeight: 22,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  modalButton: {
    flex: 1,
    height: 56,
    borderRadius: 16,
    overflow: 'hidden',
  },
  modalButtonSecondary: {
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalButtonPrimary: {
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  modalButtonGradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  modalButtonTextPrimary: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  modalButtonTextSecondary: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  resendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginBottom: 12,
    gap: 8,
  },
  resendText: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  noteText: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 12,
    fontStyle: 'italic',
    paddingHorizontal: 10,
  },
});