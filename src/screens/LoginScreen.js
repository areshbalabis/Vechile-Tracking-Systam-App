import React, { useState, useEffect, useRef } from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
  Alert,
  useColorScheme,
  Animated,
  Dimensions,
  StatusBar,
  ActivityIndicator,
  Platform,
  Easing,
} from "react-native";
import { auth } from "../firebase";
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
} from "firebase/auth";
import { Ionicons, Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import NetInfo from "@react-native-community/netinfo";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { SafeAreaView, SafeAreaProvider } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import * as NavigationBar from "expo-navigation-bar";

const { height } = Dimensions.get("window");

// ─── Haptic helper ────────────────────────────────────────────────────────────
const haptic = (type = "light") => {
  try {
    switch (type) {
      case "success": Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); break;
      case "error":   Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);   break;
      case "medium":  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);             break;
      default:        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  } catch (_) {}
};

// ─── Theme ────────────────────────────────────────────────────────────────────
const makeColors = (dark) => ({
  primary:        dark ? "#0A84FF" : "#007AFF",
  primaryTint:    dark ? "rgba(10,132,255,0.12)" : "rgba(0,122,255,0.08)",
  background:     dark ? "#000000" : "#F2F2F7",
  card:           dark ? "#1C1C1E" : "#FFFFFF",
  cardInner:      dark ? "#111111" : "#F9FAFB",
  text:           dark ? "#FFFFFF" : "#1A1A1A",
  textSecondary:  dark ? "#8E8E93" : "#6B7280",
  textTertiary:   dark ? "#636366" : "#9CA3AF",
  border:         dark ? "#2C2C2E" : "#E5E7EB",
  borderFocus:    dark ? "#0A84FF" : "#007AFF",
  success:        "#30D158",
  successTint:    dark ? "rgba(48,209,88,0.12)" : "rgba(48,209,88,0.08)",
  error:          "#FF453A",
  errorTint:      dark ? "rgba(255,69,58,0.12)"  : "rgba(255,69,58,0.08)",
  info:           "#5AC8FA",
  infoTint:       dark ? "rgba(90,200,250,0.12)" : "rgba(90,200,250,0.08)",
});

// ─── Inline field error ───────────────────────────────────────────────────────
function FieldError({ message, colors }) {
  if (!message) return null;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 5 }}>
      <Ionicons name="alert-circle" size={13} color={colors.error} />
      <Text style={{ fontSize: 12, color: colors.error, fontWeight: "500" }}>{message}</Text>
    </View>
  );
}

export default function LoginScreen({ navigation }) {
  const scheme = useColorScheme();
  const isDark = scheme === "dark";
  const colors = makeColors(isDark);

  const [email,          setEmail]          = useState("");
  const [password,       setPassword]       = useState("");
  const [showPassword,   setShowPassword]   = useState(false);
  const [isConnected,    setIsConnected]    = useState(true);
  const [isLoading,      setIsLoading]      = useState(false);
  const [isSendingVerif, setIsSendingVerif] = useState(false);
  const [isFocused,      setIsFocused]      = useState({ email: false, password: false });

  // Inline validation errors
  const [emailError,    setEmailError]    = useState("");
  const [passwordError, setPasswordError] = useState("");

  // Animations
  const shakeAnim   = useRef(new Animated.Value(0)).current;
  const fadeAnim    = useRef(new Animated.Value(0)).current;
  const slideAnim   = useRef(new Animated.Value(28)).current;
  const logoAnim    = useRef(new Animated.Value(0)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;

  // ── System UI ────────────────────────────────────────────────────────────────
  useEffect(() => {
    StatusBar.setHidden(true, "slide");
    NavigationBar.setVisibilityAsync("hidden");
    NavigationBar.setBehaviorAsync("overlay-swipe");
    return () => {
      StatusBar.setHidden(false, "slide");
      NavigationBar.setVisibilityAsync("visible");
    };
  }, []);

  // ── Network ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = NetInfo.addEventListener((s) => setIsConnected(s.isConnected ?? true));
    return () => unsub();
  }, []);

  // ── Entrance ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1, duration: 700, delay: 150,
        easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0, duration: 600, delay: 150,
        easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }),
      Animated.spring(logoAnim, {
        toValue: 1, tension: 120, friction: 8, delay: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // ── Animations ────────────────────────────────────────────────────────────────
  const triggerShake = () => {
    haptic("error");
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10,  duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8,   duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0,   duration: 50, useNativeDriver: true }),
    ]).start();
  };

  const animateButton = () => {
    Animated.sequence([
      Animated.timing(buttonScale, { toValue: 0.96, duration: 80, useNativeDriver: true }),
      Animated.timing(buttonScale, { toValue: 1,    duration: 80, useNativeDriver: true }),
    ]).start();
  };

  // ── Validation ────────────────────────────────────────────────────────────────
  const validate = () => {
    let valid = true;
    setEmailError(""); setPasswordError("");

    if (!email.trim()) {
      setEmailError("Email is required.");
      valid = false;
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      setEmailError("Enter a valid email address.");
      valid = false;
    }
    if (!password.trim()) {
      setPasswordError("Password is required.");
      valid = false;
    }
    return valid;
  };

  // ── Verification email ────────────────────────────────────────────────────────
  const sendVerifEmail = async (user) => {
    setIsSendingVerif(true);
    try {
      await sendEmailVerification(user);
      haptic("success");
      Alert.alert(
        "Verification sent",
        "Check your inbox and click the verification link, then sign in again.",
        [{ text: "OK" }]
      );
    } catch {
      haptic("error");
      Alert.alert("Error", "Could not send verification email. Try again.");
    } finally {
      setIsSendingVerif(false);
    }
  };

  const showVerifAlert = (user) => {
    Alert.alert(
      "Email not verified",
      "Please verify your email before signing in. Check your inbox or request a new link.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Resend verification", onPress: () => sendVerifEmail(user) },
        {
          text: "Check inbox",
          onPress: () =>
            Alert.alert("Check your inbox", "Look in your email (and spam folder) for our verification link."),
        },
      ]
    );
  };

  // ── Login ─────────────────────────────────────────────────────────────────────
  const handleLogin = async () => {
    if (isLoading || isSendingVerif) return;
    if (!validate()) { triggerShake(); return; }

    if (!isConnected) {
      Alert.alert("No connection", "Please connect to the internet to sign in.");
      return;
    }

    setIsLoading(true);
    animateButton();
    haptic("light");

    try {
      const { user } = await signInWithEmailAndPassword(auth, email.trim(), password);

      if (!user.emailVerified) {
        await auth.signOut();
        triggerShake();
        showVerifAlert(user);
        return;
      }

      haptic("success");
      navigation.replace("Home");
    } catch (error) {
      triggerShake();
      const msg = {
        "auth/invalid-email":        "Enter a valid email address.",
        "auth/user-not-found":       "No account found with this email.",
        "auth/wrong-password":       "Incorrect password. Try again.",
        "auth/user-disabled":        "This account has been deactivated.",
        "auth/too-many-requests":    "Too many attempts. Try again later.",
        "auth/network-request-failed": "Network error. Check your connection.",
        "auth/invalid-credential":   "Invalid email or password.",
      }[error.code] || "Sign in failed. Check your email and password.";

      // Show inline error on password field for credential errors
      if (["auth/wrong-password", "auth/invalid-credential"].includes(error.code)) {
        setPasswordError(msg);
      } else if (error.code === "auth/user-not-found" || error.code === "auth/invalid-email") {
        setEmailError(msg);
      } else {
        Alert.alert("Sign in failed", msg);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // ── Forgot password ───────────────────────────────────────────────────────────
  const handleForgotPassword = () => {
    haptic("medium");
    if (!email.trim()) {
      setEmailError("Enter your email above first.");
      triggerShake();
      return;
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      setEmailError("Enter a valid email address first.");
      triggerShake();
      return;
    }
    if (!isConnected) {
      Alert.alert("No connection", "You need internet to reset your password.");
      return;
    }
    Alert.alert(
      "Reset password",
      `Send reset instructions to ${email}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Send",
          onPress: () =>
            sendPasswordResetEmail(auth, email.trim())
              .then(() => {
                haptic("success");
                Alert.alert("Check your email", "Password reset instructions have been sent.");
              })
              .catch((err) => {
                haptic("error");
                Alert.alert(
                  "Error",
                  err.code === "auth/user-not-found"
                    ? "No account found with this email."
                    : "Could not send reset email. Try again."
                );
              }),
        },
      ]
    );
  };

  // ── Logo scale ────────────────────────────────────────────────────────────────
  const logoScale = logoAnim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] });

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <SafeAreaProvider>
      <SafeAreaView style={[s.root, { backgroundColor: colors.background }]}>
        <KeyboardAwareScrollView
          contentContainerStyle={s.scroll}
          enableOnAndroid
          extraScrollHeight={80}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <Animated.View
            style={[s.page, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}
          >
            {/* ── Hero ── */}
            <View style={s.hero}>
              <Animated.View
                style={[
                  s.logoBox,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    transform: [{ scale: logoScale }],
                  },
                ]}
              >
                <View style={[s.logoInner, { backgroundColor: colors.primaryTint }]}>
                  <MaterialCommunityIcons name="car-connected" size={36} color={colors.primary} />
                </View>
              </Animated.View>

              <Text style={[s.title, { color: colors.text }]}>Welcome back</Text>
              <Text style={[s.subtitle, { color: colors.textSecondary }]}>
                Sign in to your driver dashboard
              </Text>

              {/* Connection pill */}
              <View
                style={[
                  s.connPill,
                  {
                    backgroundColor: isConnected ? colors.successTint : colors.errorTint,
                    borderColor: isConnected ? `${colors.success}40` : `${colors.error}40`,
                  },
                ]}
              >
                <View
                  style={[
                    s.connDot,
                    { backgroundColor: isConnected ? colors.success : colors.error },
                  ]}
                />
                <Text
                  style={[
                    s.connText,
                    { color: isConnected ? colors.success : colors.error },
                  ]}
                >
                  {isConnected ? "Online" : "Offline — connect to sign in"}
                </Text>
              </View>
            </View>

            {/* ── Form card ── */}
            <Animated.View
              style={[
                s.card,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  transform: [{ translateX: shakeAnim }],
                },
              ]}
            >
              {/* Email */}
              <View style={s.field}>
                <Text style={[s.label, { color: colors.textSecondary }]}>Email address</Text>
                <View
                  style={[
                    s.inputRow,
                    {
                      backgroundColor: colors.cardInner,
                      borderColor: emailError
                        ? colors.error
                        : isFocused.email
                        ? colors.borderFocus
                        : colors.border,
                      borderWidth: isFocused.email || emailError ? 1.5 : 1,
                    },
                  ]}
                >
                  <Ionicons
                    name="mail-outline"
                    size={18}
                    color={
                      emailError ? colors.error
                      : isFocused.email ? colors.primary
                      : colors.textTertiary
                    }
                    style={s.inputIcon}
                  />
                  <TextInput
                    placeholder="Enter your email"
                    placeholderTextColor={colors.textTertiary}
                    value={email}
                    onChangeText={(v) => { setEmail(v); if (emailError) setEmailError(""); }}
                    style={[s.input, { color: colors.text }]}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    onFocus={() => setIsFocused({ ...isFocused, email: true })}
                    onBlur={() => setIsFocused({ ...isFocused, email: false })}
                    editable={!isLoading && !isSendingVerif}
                    returnKeyType="next"
                  />
                  {email.length > 0 && (
                    <TouchableOpacity
                      onPress={() => { haptic(); setEmail(""); setEmailError(""); }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      disabled={isLoading}
                    >
                      <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
                    </TouchableOpacity>
                  )}
                </View>
                <FieldError message={emailError} colors={colors} />
              </View>

              {/* Password */}
              <View style={s.field}>
                <View style={s.labelRow}>
                  <Text style={[s.label, { color: colors.textSecondary }]}>Password</Text>
                  <TouchableOpacity onPress={handleForgotPassword} disabled={isLoading}>
                    <Text style={[s.forgotLink, { color: colors.primary }]}>Forgot password?</Text>
                  </TouchableOpacity>
                </View>
                <View
                  style={[
                    s.inputRow,
                    {
                      backgroundColor: colors.cardInner,
                      borderColor: passwordError
                        ? colors.error
                        : isFocused.password
                        ? colors.borderFocus
                        : colors.border,
                      borderWidth: isFocused.password || passwordError ? 1.5 : 1,
                    },
                  ]}
                >
                  <Ionicons
                    name="lock-closed-outline"
                    size={18}
                    color={
                      passwordError ? colors.error
                      : isFocused.password ? colors.primary
                      : colors.textTertiary
                    }
                    style={s.inputIcon}
                  />
                  <TextInput
                    placeholder="Enter your password"
                    placeholderTextColor={colors.textTertiary}
                    value={password}
                    onChangeText={(v) => { setPassword(v); if (passwordError) setPasswordError(""); }}
                    style={[s.input, { color: colors.text }]}
                    secureTextEntry={!showPassword}
                    onFocus={() => setIsFocused({ ...isFocused, password: true })}
                    onBlur={() => setIsFocused({ ...isFocused, password: false })}
                    editable={!isLoading && !isSendingVerif}
                    returnKeyType="done"
                    onSubmitEditing={handleLogin}
                  />
                  <TouchableOpacity
                    onPress={() => { haptic(); setShowPassword((v) => !v); }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    disabled={isLoading}
                  >
                    <Feather
                      name={showPassword ? "eye" : "eye-off"}
                      size={18}
                      color={colors.textTertiary}
                    />
                  </TouchableOpacity>
                </View>
                <FieldError message={passwordError} colors={colors} />
              </View>

              {/* Sign in button */}
              <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
                <TouchableOpacity
                  style={[
                    s.signInBtn,
                    {
                      backgroundColor: colors.primary,
                      opacity: isLoading || isSendingVerif ? 0.75 : 1,
                    },
                  ]}
                  onPress={handleLogin}
                  disabled={isLoading || isSendingVerif}
                  activeOpacity={0.88}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : isSendingVerif ? (
                    <>
                      <ActivityIndicator color="#fff" size="small" />
                      <Text style={[s.signInText, { marginLeft: 8 }]}>Sending…</Text>
                    </>
                  ) : (
                    <>
                      <Text style={s.signInText}>Sign in</Text>
                      <Ionicons name="arrow-forward" size={20} color="#fff" />
                    </>
                  )}
                </TouchableOpacity>
              </Animated.View>

              {/* Verification note */}
              <View style={[s.verifNote, { backgroundColor: colors.primaryTint }]}>
                <Ionicons name="shield-checkmark-outline" size={15} color={colors.primary} />
                <Text style={[s.verifText, { color: colors.primary }]}>
                  Email verification required for account security
                </Text>
              </View>

              {/* Divider */}
              <View style={s.divRow}>
                <View style={[s.divLine, { backgroundColor: colors.border }]} />
                <Text style={[s.divText, { color: colors.textTertiary }]}>New to the app?</Text>
                <View style={[s.divLine, { backgroundColor: colors.border }]} />
              </View>

              {/* Register */}
              <View style={s.regRow}>
                <Text style={[s.regText, { color: colors.textSecondary }]}>
                  Don't have an account?
                </Text>
                <TouchableOpacity
                  onPress={() => { haptic(); navigation.navigate("Register"); }}
                  disabled={isLoading}
                >
                  <Text style={[s.regLink, { color: colors.primary }]}> Sign up</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </Animated.View>
        </KeyboardAwareScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flexGrow: 1 },
  page: {
    flex: 1,
    minHeight: height,
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "ios" ? height * 0.06 : 32,
    paddingBottom: 40,
  },

  // ── Hero ────────────────────────────────────────────────────────────────────
  hero: { alignItems: "center", marginBottom: 28 },
  logoBox: {
    width: 88,
    height: 88,
    borderRadius: 26,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  logoInner: {
    width: 60,
    height: 60,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.5,
    marginBottom: 6,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 15,
    fontWeight: "400",
    textAlign: "center",
    marginBottom: 16,
    opacity: 0.85,
  },
  connPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  connDot: { width: 7, height: 7, borderRadius: 3.5 },
  connText: { fontSize: 13, fontWeight: "600" },

  // ── Card ────────────────────────────────────────────────────────────────────
  card: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 22,
  },

  // ── Fields ──────────────────────────────────────────────────────────────────
  field: { marginBottom: 20 },
  label: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginBottom: 7,
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 7,
  },
  forgotLink: { fontSize: 13, fontWeight: "600" },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 52,
  },
  inputIcon: { marginRight: 10 },
  input: {
    flex: 1,
    fontSize: 15,
    fontWeight: "400",
    height: "100%",
  },

  // ── Button ──────────────────────────────────────────────────────────────────
  signInBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 52,
    borderRadius: 14,
    marginBottom: 14,
  },
  signInText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.3,
  },

  // ── Verify note ─────────────────────────────────────────────────────────────
  verifNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginBottom: 22,
  },
  verifText: { fontSize: 12, fontWeight: "500", flex: 1, lineHeight: 17 },

  // ── Divider ─────────────────────────────────────────────────────────────────
  divRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 18 },
  divLine: { flex: 1, height: 1 },
  divText: { fontSize: 13, fontWeight: "500" },

  // ── Register ────────────────────────────────────────────────────────────────
  regRow: { flexDirection: "row", justifyContent: "center", alignItems: "center" },
  regText: { fontSize: 14, fontWeight: "400" },
  regLink: { fontSize: 14, fontWeight: "700" },
});