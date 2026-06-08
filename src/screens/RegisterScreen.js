import React, { useState, useEffect, useRef } from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  useColorScheme,
  Animated,
  Dimensions,
  StatusBar,
  ActivityIndicator,
  Modal,
  Linking,
  Easing,
} from "react-native";
import { createUserWithEmailAndPassword, sendEmailVerification } from "firebase/auth";
import { auth, realtimeDb } from "../firebase";
import { ref, set } from "firebase/database";
import { Ionicons, MaterialCommunityIcons, Feather } from "@expo/vector-icons";
import NetInfo from "@react-native-community/netinfo";
import { SafeAreaView, SafeAreaProvider } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import * as NavigationBar from "expo-navigation-bar";

const { height } = Dimensions.get("window");

// ─── Constants ────────────────────────────────────────────────────────────────
const VEHICLE_COLORS = [
  "White","Black","Red","Blue","Green",
  "Yellow","Orange","Purple","Gray","Brown","Silver","Gold",
].map((v) => ({ label: v, value: v }));

const VEHICLE_TYPES = [
  { label: "Van",  value: "Van"  },
  { label: "Bus",  value: "Bus"  },
];

const DISPOSABLE_DOMAINS = [
  "tempmail.com","mailinator.com","guerrillamail.com",
  "sharklasers.com","trashmail.com","10minutemail.com",
  "throwawaymail.com","yopmail.com",
];

const RESEND_COOLDOWN = 60;

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
  primary:       dark ? "#0A84FF" : "#007AFF",
  primaryTint:   dark ? "rgba(10,132,255,0.12)" : "rgba(0,122,255,0.08)",
  background:    dark ? "#000000" : "#F2F2F7",
  card:          dark ? "#1C1C1E" : "#FFFFFF",
  cardInner:     dark ? "#111111" : "#F9FAFB",
  text:          dark ? "#FFFFFF" : "#1A1A1A",
  textSecondary: dark ? "#8E8E93" : "#6B7280",
  textTertiary:  dark ? "#636366" : "#9CA3AF",
  border:        dark ? "#2C2C2E" : "#E5E7EB",
  borderFocus:   dark ? "#0A84FF" : "#007AFF",
  success:       "#30D158",
  successTint:   dark ? "rgba(48,209,88,0.12)" : "rgba(48,209,88,0.08)",
  warning:       "#FF9F0A",
  warningTint:   dark ? "rgba(255,159,10,0.12)" : "rgba(255,159,10,0.08)",
  error:         "#FF453A",
  errorTint:     dark ? "rgba(255,69,58,0.12)"  : "rgba(255,69,58,0.08)",
});

// ─── Password strength ────────────────────────────────────────────────────────
const getStrength = (pw) => {
  if (!pw) return { score: 0, label: "", color: "transparent" };
  let s = 0;
  if (pw.length >= 6) s++;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[!@#$%^&*(),.?":{}|<>]/.test(pw)) s++;
  const levels = [
    { label: "Very weak",   color: "#FF3B30" },
    { label: "Weak",        color: "#FF9500" },
    { label: "Fair",        color: "#FFCC00" },
    { label: "Good",        color: "#34C759" },
    { label: "Strong",      color: "#30D158" },
    { label: "Very strong", color: "#28CD41" },
  ];
  return { score: s, ...levels[Math.min(s, 5)] };
};

// ─── Validators ───────────────────────────────────────────────────────────────
const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

const validateEmailField = (email) => {
  if (!email.trim()) return "Email is required.";
  if (!isValidEmail(email)) return "Enter a valid email address.";
  const domain = email.split("@")[1]?.toLowerCase() || "";
  if (DISPOSABLE_DOMAINS.some((d) => domain.includes(d)))
    return "Please use a permanent email address.";
  return "";
};

const validatePassword = (pw) => {
  if (!pw) return "Password is required.";
  if (pw.length < 6) return "Must be at least 6 characters.";
  if (!/[A-Z]/.test(pw)) return "Must contain an uppercase letter.";
  if (!/\d/.test(pw)) return "Must contain a number.";
  return "";
};

const validatePhone = (phone) => {
  const cleaned = phone.replace(/\s/g, "");
  if (!cleaned) return "Phone number is required.";
  if (!/^09\d{9}$/.test(cleaned)) return "Enter a valid PH mobile number (09XX XXX XXXX).";
  return "";
};

const validatePlate = (plate) => {
  if (!plate) return "Plate number is required.";
  if (!/^[A-Z]{3}-[0-9]{4}$/.test(plate)) return "Format must be ABC-1234.";
  return "";
};

// ─── Reusable field component ─────────────────────────────────────────────────
function Field({ label, iconName, iconLib = "ion", error, focused, children, hint, rightEl }) {
  const Icon =
    iconLib === "mci" ? MaterialCommunityIcons
    : iconLib === "feather" ? Feather
    : Ionicons;
  return (
    <View style={{ marginBottom: 16 }}>
      <View style={f.labelRow}>
        <Icon name={iconName} size={14} color="transparent" style={{ marginRight: 4 }} />
        <Text style={f.label}>{label}</Text>
        {rightEl}
      </View>
      {children}
      {error ? (
        <View style={f.errorRow}>
          <Ionicons name="alert-circle" size={12} color="#FF453A" />
          <Text style={f.errorText}>{error}</Text>
        </View>
      ) : hint ? (
        <Text style={f.hintText}>{hint}</Text>
      ) : null}
    </View>
  );
}

const f = StyleSheet.create({
  labelRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  label: { fontSize: 11, fontWeight: "600", letterSpacing: 0.5, textTransform: "uppercase", color: "#8E8E93" },
  errorRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  errorText: { fontSize: 12, color: "#FF453A", fontWeight: "500", flex: 1 },
  hintText: { fontSize: 11, color: "#636366", marginTop: 4, fontStyle: "italic" },
});

// ─── Inline selector (replaces Picker) ───────────────────────────────────────
function InlineSelector({ value, options, onSelect, placeholder, disabled, colors }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <View>
      <TouchableOpacity
        style={[
          rs.inputRow,
          {
            backgroundColor: colors.cardInner,
            borderColor: colors.border,
            justifyContent: "space-between",
          },
        ]}
        onPress={() => { if (!disabled) { haptic(); setOpen(true); } }}
        disabled={disabled}
        activeOpacity={0.7}
      >
        <Text style={{ fontSize: 15, color: selected ? colors.text : colors.textTertiary, flex: 1 }}>
          {selected ? selected.label : placeholder}
        </Text>
        <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 24 }}
          activeOpacity={1}
          onPress={() => setOpen(false)}
        >
          <View style={[rs.selectorSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {options.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  rs.selectorOption,
                  {
                    backgroundColor: value === opt.value ? colors.primaryTint : "transparent",
                    borderColor: colors.border,
                  },
                ]}
                onPress={() => { haptic(); onSelect(opt.value); setOpen(false); }}
              >
                <Text style={{ fontSize: 15, color: colors.text, fontWeight: "500" }}>{opt.label}</Text>
                {value === opt.value && <Ionicons name="checkmark" size={16} color={colors.primary} />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function DriverRegisterScreen({ navigation }) {
  const dark = useColorScheme() === "dark";
  const colors = makeColors(dark);

  const EMPTY_FORM = { name: "", vehicle: "", vehicleColor: "", phoneNumber: "", plate: "", email: "", password: "", confirmPassword: "" };
  const [form,           setForm]           = useState(EMPTY_FORM);
  const [errors,         setErrors]         = useState({});
  const [showPw,         setShowPw]         = useState(false);
  const [showConfirmPw,  setShowConfirmPw]  = useState(false);
  const [isConnected,    setIsConnected]    = useState(true);
  const [isLoading,      setIsLoading]      = useState(false);
  const [isSending,      setIsSending]      = useState(false);
  const [isFocused,      setIsFocused]      = useState({});

  // Verification state
  const [showVerifModal,   setShowVerifModal]   = useState(false);
  const [emailToVerify,    setEmailToVerify]    = useState("");
  const [currentUser,      setCurrentUser]      = useState(null);
  const [userCreated,      setUserCreated]      = useState(false);
  const [isEmailVerified,  setIsEmailVerified]  = useState(false);
  const [canResend,        setCanResend]        = useState(true);
  const [resendTimer,      setResendTimer]      = useState(0);

  // Animations
  const fadeAnim    = useRef(new Animated.Value(0)).current;
  const slideAnim   = useRef(new Animated.Value(28)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;

  // ── System UI ──────────────────────────────────────────────────────────────
  useEffect(() => {
    StatusBar.setHidden(true, "slide");
    NavigationBar.setVisibilityAsync("hidden");
    NavigationBar.setBehaviorAsync("overlay-swipe");
    return () => {
      StatusBar.setHidden(false, "slide");
      NavigationBar.setVisibilityAsync("visible");
    };
  }, []);

  // ── Network ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = NetInfo.addEventListener((s) => setIsConnected(s.isConnected ?? true));
    return () => unsub();
  }, []);

  // ── Entrance animation ─────────────────────────────────────────────────────
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 700, delay: 150, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, delay: 150, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, []);

  // ── Progress bar ───────────────────────────────────────────────────────────
  const filledCount = Object.values(form).filter((v) => v.trim() !== "").length;
  const totalFields = Object.keys(EMPTY_FORM).length;

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: filledCount / totalFields,
      duration: 250,
      useNativeDriver: false,
    }).start();
  }, [filledCount]);

  // ── Resend timer ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (resendTimer <= 0) return;
    const t = setInterval(() => {
      setResendTimer((p) => {
        if (p <= 1) { setCanResend(true); clearInterval(t); return 0; }
        return p - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [resendTimer]);

  // ── Input helpers ──────────────────────────────────────────────────────────
  const update = (field, value) => {
    setForm((p) => ({ ...p, [field]: value }));
    if (errors[field]) setErrors((p) => ({ ...p, [field]: "" }));
    if (field === "email") { setIsEmailVerified(false); setUserCreated(false); setCurrentUser(null); }
  };

  const formatPlate = (text) => {
    let c = text.replace(/\s/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (c.length > 3) c = c.slice(0, 3) + "-" + c.slice(3, 7);
    update("plate", c);
  };

  const formatPhone = (text) => {
    let c = text.replace(/\D/g, "").substring(0, 11);
    let f = c;
    if (c.length > 4) f = c.slice(0, 4) + " " + c.slice(4);
    if (c.length > 7) f = c.slice(0, 4) + " " + c.slice(4, 7) + " " + c.slice(7);
    update("phoneNumber", f);
  };

  const focus = (field) => setIsFocused((p) => ({ ...p, [field]: true }));
  const blur  = (field) => setIsFocused((p) => ({ ...p, [field]: false }));

  // ── Validate ───────────────────────────────────────────────────────────────
  const validate = () => {
    const e = {};
    if (!form.name.trim())       e.name         = "Full name is required.";
    if (!form.vehicle)           e.vehicle      = "Select a vehicle type.";
    if (!form.vehicleColor)      e.vehicleColor = "Select a vehicle color.";
    const phoneErr = validatePhone(form.phoneNumber);
    if (phoneErr)                e.phoneNumber  = phoneErr;
    const plateErr = validatePlate(form.plate);
    if (plateErr)                e.plate        = plateErr;
    const emailErr = validateEmailField(form.email);
    if (emailErr)                e.email        = emailErr;
    const pwErr = validatePassword(form.password);
    if (pwErr)                   e.password     = pwErr;
    if (!form.confirmPassword)   e.confirmPassword = "Please confirm your password.";
    else if (form.password !== form.confirmPassword) e.confirmPassword = "Passwords do not match.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // ── Send verification ──────────────────────────────────────────────────────
  const sendVerifEmail = async () => {
    setIsSending(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, form.email.trim(), form.password);
      const user = cred.user;
      setCurrentUser(user);
      setUserCreated(true);
      await sendEmailVerification(user);
      setEmailToVerify(form.email.trim());
      setShowVerifModal(true);
      setCanResend(false);
      setResendTimer(RESEND_COOLDOWN);
      haptic("success");
    } catch (err) {
      haptic("error");
      const msg = {
        "auth/email-already-in-use": "This email is already registered. Sign in instead.",
        "auth/invalid-email":        "Enter a valid email address.",
        "auth/weak-password":        "Password is too weak.",
        "auth/network-request-failed": "Network error. Check your connection.",
      }[err.code] || "Failed to send verification email. Try again.";
      Alert.alert("Error", msg);
    } finally {
      setIsSending(false);
    }
  };

  const resendVerifEmail = async () => {
    if (!canResend || !currentUser) return;
    setCanResend(false);
    setResendTimer(RESEND_COOLDOWN);
    try {
      await sendEmailVerification(currentUser);
      haptic("success");
      Alert.alert("Sent", "A new verification email has been sent.");
    } catch {
      haptic("error");
      Alert.alert("Error", "Failed to resend. Try again.");
      setCanResend(true);
    }
  };

  const checkVerification = async () => {
    const user = currentUser || auth.currentUser;
    if (!user) return;
    try {
      await user.reload();
      if (user.emailVerified) {
        setIsEmailVerified(true);
        haptic("success");
        Alert.alert(
          "Email verified",
          "Your email is confirmed. Completing your registration…",
          [{ text: "Continue", onPress: () => { setShowVerifModal(false); completeRegistration(user); } }]
        );
      } else {
        Alert.alert(
          "Not verified yet",
          "Please click the link in your email, then tap 'I've verified' again.",
          [
            { text: "Open email", onPress: () => Linking.openURL("mailto:") },
            { text: "Try again",  onPress: checkVerification },
          ]
        );
      }
    } catch {
      Alert.alert("Error", "Could not check verification status. Try again.");
    }
  };

  // ── Complete registration ──────────────────────────────────────────────────
  const completeRegistration = async (user) => {
    const u = user || currentUser || auth.currentUser;
    if (!u?.emailVerified) return;
    setIsLoading(true);
    try {
      await set(ref(realtimeDb, `drivers/${u.uid}`), {
        name:          form.name.trim(),
        vehicle:       form.vehicle,
        vehicleColor:  form.vehicleColor,
        phoneNumber:   form.phoneNumber.replace(/\s/g, ""),
        plate:         form.plate.toUpperCase(),
        email:         form.email.toLowerCase().trim(),
        createdAt:     Date.now(),
        status:        "active",
        role:          "driver",
        emailVerified: true,
        isActive:      true,
        profileCompleted: true,
      });
      haptic("success");
      Alert.alert(
        "Registration complete",
        "Your driver account is ready.",
        [{ text: "Go to dashboard", onPress: () => navigation.replace("Home") }]
      );
    } catch (err) {
      haptic("error");
      Alert.alert("Registration failed", "Could not save your details. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // ── Main button ────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (isLoading || isSending) return;
    haptic();
    Animated.sequence([
      Animated.timing(buttonScale, { toValue: 0.96, duration: 80, useNativeDriver: true }),
      Animated.timing(buttonScale, { toValue: 1,    duration: 80, useNativeDriver: true }),
    ]).start();

    if (isEmailVerified) {
      completeRegistration();
      return;
    }

    if (!validate()) { haptic("error"); return; }
    if (!isConnected) { Alert.alert("No connection", "Internet required to register."); return; }
    await sendVerifEmail();
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  const pwStrength = getStrength(form.password);
  const isFormFilled = Object.values(form).every((v) => v.trim() !== "");
  const disabled = (field) => isLoading || isSending || isEmailVerified;

  const inputStyle = (field) => [
    rs.inputRow,
    {
      backgroundColor: colors.cardInner,
      borderColor: errors[field]
        ? colors.error
        : isFocused[field]
        ? colors.borderFocus
        : colors.border,
      borderWidth: errors[field] || isFocused[field] ? 1.5 : 1,
    },
  ];

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaProvider>
      <SafeAreaView style={[rs.root, { backgroundColor: colors.background }]}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
        >
          <ScrollView
            contentContainerStyle={{ flexGrow: 1 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Animated.View
              style={[
                rs.page,
                { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
              ]}
            >
              {/* ── Progress ── */}
              <View style={rs.progressWrap}>
                <View style={[rs.progressTrack, { backgroundColor: colors.border }]}>
                  <Animated.View
                    style={[
                      rs.progressFill,
                      {
                        backgroundColor: colors.primary,
                        width: progressAnim.interpolate({
                          inputRange: [0, 1], outputRange: ["0%", "100%"],
                        }),
                      },
                    ]}
                  />
                </View>
                <Text style={[rs.progressText, { color: colors.textSecondary }]}>
                  {filledCount} of {totalFields} fields complete
                </Text>
              </View>

              {/* ── Hero ── */}
              <View style={rs.hero}>
                <View style={[rs.logoBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={[rs.logoInner, { backgroundColor: colors.primaryTint }]}>
                    <MaterialCommunityIcons name="truck-fast" size={32} color={colors.primary} />
                  </View>
                </View>
                <Text style={[rs.title, { color: colors.text }]}>Join as a driver</Text>
                <Text style={[rs.subtitle, { color: colors.textSecondary }]}>
                  {isEmailVerified
                    ? "Email verified — completing registration…"
                    : "Email verification required"}
                </Text>
                <View
                  style={[
                    rs.connPill,
                    {
                      backgroundColor: isConnected ? colors.successTint : colors.errorTint,
                      borderColor: isConnected ? `${colors.success}40` : `${colors.error}40`,
                    },
                  ]}
                >
                  <View style={[rs.connDot, { backgroundColor: isConnected ? colors.success : colors.error }]} />
                  <Text style={{ fontSize: 12, fontWeight: "600", color: isConnected ? colors.success : colors.error }}>
                    {isConnected ? "Online" : "Offline"}
                  </Text>
                </View>
              </View>

              {/* ── Form card ── */}
              <View style={[rs.card, { backgroundColor: colors.card, borderColor: colors.border }]}>

                {/* Full name */}
                <Field label="Full name" iconName="person" error={errors.name}>
                  <View style={inputStyle("name")}>
                    <Ionicons name="person-outline" size={16} color={isFocused.name ? colors.primary : colors.textTertiary} style={{ marginRight: 8 }} />
                    <TextInput
                      placeholder="Juan dela Cruz"
                      placeholderTextColor={colors.textTertiary}
                      value={form.name}
                      onChangeText={(v) => update("name", v)}
                      style={[rs.input, { color: colors.text }]}
                      onFocus={() => focus("name")}
                      onBlur={() => blur("name")}
                      editable={!disabled("name")}
                      returnKeyType="next"
                    />
                    {form.name.length > 0 && !errors.name && (
                      <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                    )}
                  </View>
                </Field>

                {/* Vehicle type + color */}
                <View style={rs.row2}>
                  <View style={rs.half}>
                    <Field label="Vehicle type" iconName="car" error={errors.vehicle}>
                      <InlineSelector
                        value={form.vehicle}
                        options={VEHICLE_TYPES}
                        onSelect={(v) => update("vehicle", v)}
                        placeholder="Select type"
                        disabled={disabled("vehicle")}
                        colors={colors}
                      />
                    </Field>
                  </View>
                  <View style={rs.half}>
                    <Field label="Color" iconName="palette" iconLib="mci" error={errors.vehicleColor}>
                      <InlineSelector
                        value={form.vehicleColor}
                        options={VEHICLE_COLORS}
                        onSelect={(v) => update("vehicleColor", v)}
                        placeholder="Select color"
                        disabled={disabled("vehicleColor")}
                        colors={colors}
                      />
                    </Field>
                  </View>
                </View>

                {/* Phone + plate */}
                <View style={rs.row2}>
                  <View style={rs.half}>
                    <Field label="Phone" iconName="call" error={errors.phoneNumber} hint="09XX XXX XXXX">
                      <View style={inputStyle("phoneNumber")}>
                        <TextInput
                          placeholder="0912 345 6789"
                          placeholderTextColor={colors.textTertiary}
                          value={form.phoneNumber}
                          onChangeText={formatPhone}
                          style={[rs.input, { color: colors.text }]}
                          keyboardType="phone-pad"
                          maxLength={14}
                          onFocus={() => focus("phoneNumber")}
                          onBlur={() => blur("phoneNumber")}
                          editable={!disabled("phoneNumber")}
                        />
                        {form.phoneNumber.length > 0 && !errors.phoneNumber && (
                          <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                        )}
                      </View>
                    </Field>
                  </View>
                  <View style={rs.half}>
                    <Field label="Plate no." iconName="license" iconLib="mci" error={errors.plate} hint="Format: ABC-1234">
                      <View style={inputStyle("plate")}>
                        <TextInput
                          placeholder="ABC-1234"
                          placeholderTextColor={colors.textTertiary}
                          value={form.plate}
                          onChangeText={formatPlate}
                          style={[rs.input, { color: colors.text }]}
                          autoCapitalize="characters"
                          maxLength={8}
                          onFocus={() => focus("plate")}
                          onBlur={() => blur("plate")}
                          editable={!disabled("plate")}
                        />
                        {form.plate.length > 0 && !errors.plate && (
                          <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                        )}
                      </View>
                    </Field>
                  </View>
                </View>

                {/* Email */}
                <Field
                  label="Email address"
                  iconName="mail"
                  error={errors.email}
                  hint="Must be a valid, active email"
                  rightEl={
                    isEmailVerified ? (
                      <View style={[rs.verifiedBadge, { backgroundColor: colors.successTint }]}>
                        <Ionicons name="checkmark-circle" size={12} color={colors.success} />
                        <Text style={{ fontSize: 11, color: colors.success, fontWeight: "600", marginLeft: 3 }}>Verified</Text>
                      </View>
                    ) : null
                  }
                >
                  <View style={inputStyle("email")}>
                    <Ionicons name="mail-outline" size={16} color={isFocused.email ? colors.primary : colors.textTertiary} style={{ marginRight: 8 }} />
                    <TextInput
                      placeholder="driver@example.com"
                      placeholderTextColor={colors.textTertiary}
                      value={form.email}
                      onChangeText={(v) => update("email", v)}
                      style={[rs.input, { color: colors.text }]}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      onFocus={() => focus("email")}
                      onBlur={() => blur("email")}
                      editable={!disabled("email")}
                    />
                    {form.email.length > 0 && isValidEmail(form.email) && !errors.email && (
                      <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                    )}
                  </View>
                </Field>

                {/* Password */}
                <Field label="Password" iconName="lock-closed" error={errors.password}>
                  <View style={inputStyle("password")}>
                    <Ionicons name="lock-closed-outline" size={16} color={isFocused.password ? colors.primary : colors.textTertiary} style={{ marginRight: 8 }} />
                    <TextInput
                      placeholder="Create a secure password"
                      placeholderTextColor={colors.textTertiary}
                      value={form.password}
                      onChangeText={(v) => update("password", v)}
                      style={[rs.input, { color: colors.text }]}
                      secureTextEntry={!showPw}
                      onFocus={() => focus("password")}
                      onBlur={() => blur("password")}
                      editable={!disabled("password")}
                    />
                    <TouchableOpacity onPress={() => { haptic(); setShowPw((v) => !v); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Feather name={showPw ? "eye" : "eye-off"} size={16} color={colors.textTertiary} />
                    </TouchableOpacity>
                  </View>

                  {/* Strength bar */}
                  {form.password.length > 0 && (
                    <View style={{ marginTop: 8 }}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                        <Text style={{ fontSize: 11, color: colors.textTertiary }}>Strength</Text>
                        <Text style={{ fontSize: 11, color: pwStrength.color, fontWeight: "600" }}>{pwStrength.label}</Text>
                      </View>
                      <View style={{ flexDirection: "row", gap: 4 }}>
                        {[1, 2, 3, 4, 5].map((i) => (
                          <View
                            key={i}
                            style={{
                              flex: 1, height: 3, borderRadius: 2,
                              backgroundColor: i <= pwStrength.score ? pwStrength.color : colors.border,
                            }}
                          />
                        ))}
                      </View>

                      {/* Requirements */}
                      <View style={{ marginTop: 8, gap: 4 }}>
                        {[
                          { label: "At least 6 characters", met: form.password.length >= 6 },
                          { label: "One uppercase letter",  met: /[A-Z]/.test(form.password) },
                          { label: "One number",            met: /\d/.test(form.password) },
                        ].map((r, i) => (
                          <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                            <Ionicons
                              name={r.met ? "checkmark-circle" : "ellipse-outline"}
                              size={13}
                              color={r.met ? colors.success : colors.textTertiary}
                            />
                            <Text style={{ fontSize: 12, color: r.met ? colors.text : colors.textTertiary }}>
                              {r.label}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                </Field>

                {/* Confirm password */}
                <Field label="Confirm password" iconName="shield-checkmark" error={errors.confirmPassword}>
                  <View style={inputStyle("confirmPassword")}>
                    <Ionicons name="shield-checkmark-outline" size={16} color={isFocused.confirmPassword ? colors.primary : colors.textTertiary} style={{ marginRight: 8 }} />
                    <TextInput
                      placeholder="Re-enter your password"
                      placeholderTextColor={colors.textTertiary}
                      value={form.confirmPassword}
                      onChangeText={(v) => update("confirmPassword", v)}
                      style={[rs.input, { color: colors.text }]}
                      secureTextEntry={!showConfirmPw}
                      onFocus={() => focus("confirmPassword")}
                      onBlur={() => blur("confirmPassword")}
                      editable={!disabled("confirmPassword")}
                      returnKeyType="done"
                      onSubmitEditing={handleSubmit}
                    />
                    <TouchableOpacity onPress={() => { haptic(); setShowConfirmPw((v) => !v); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Feather name={showConfirmPw ? "eye" : "eye-off"} size={16} color={colors.textTertiary} />
                    </TouchableOpacity>
                  </View>
                </Field>

                {/* Pending verification banner */}
                {userCreated && !isEmailVerified && (
                  <View style={[rs.banner, { backgroundColor: colors.warningTint, borderColor: `${colors.warning}40` }]}>
                    <Ionicons name="time-outline" size={16} color={colors.warning} />
                    <Text style={[rs.bannerText, { color: colors.warning }]}>
                      Account created — verify your email to continue.
                    </Text>
                  </View>
                )}

                {/* Submit button */}
                <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
                  <TouchableOpacity
                    style={[rs.submitBtn, { backgroundColor: colors.primary, opacity: isFormFilled ? 1 : 0.5 }]}
                    onPress={handleSubmit}
                    disabled={isLoading || isSending || !isFormFilled}
                    activeOpacity={0.88}
                  >
                    {isLoading || isSending ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <>
                        <MaterialCommunityIcons
                          name={isEmailVerified ? "car-key" : "email-check-outline"}
                          size={20}
                          color="#fff"
                        />
                        <Text style={rs.submitText}>
                          {isEmailVerified ? "Complete registration" : "Verify email first"}
                        </Text>
                        <Ionicons name="arrow-forward" size={18} color="#fff" />
                      </>
                    )}
                  </TouchableOpacity>
                </Animated.View>

                {/* Divider + sign in */}
                <View style={rs.divRow}>
                  <View style={[rs.divLine, { backgroundColor: colors.border }]} />
                  <Text style={[rs.divText, { color: colors.textTertiary }]}>Already registered?</Text>
                  <View style={[rs.divLine, { backgroundColor: colors.border }]} />
                </View>

                <TouchableOpacity
                  style={[rs.loginBtn, { borderColor: colors.border }]}
                  onPress={() => { haptic(); navigation.navigate("Login"); }}
                  disabled={isLoading || isSending}
                  activeOpacity={0.75}
                >
                  <Text style={[rs.loginText, { color: colors.textSecondary }]}>Sign in to existing account</Text>
                  <Ionicons name="log-in-outline" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>

        {/* ── Email verification modal ── */}
        <Modal
          visible={showVerifModal}
          animationType="slide"
          transparent
          onRequestClose={() => setShowVerifModal(false)}
        >
          <View style={rs.modalOverlay}>
            <View style={[rs.modalSheet, { backgroundColor: colors.card }]}>
              {/* Icon + heading */}
              <View style={[rs.modalIconWrap, { backgroundColor: colors.successTint }]}>
                <Ionicons name="mail" size={32} color={colors.success} />
              </View>
              <Text style={[rs.modalTitle, { color: colors.text }]}>Verify your email</Text>
              <Text style={[rs.modalSub, { color: colors.textSecondary }]}>
                We sent a verification link to:
              </Text>
              <Text style={[rs.modalEmail, { color: colors.primary }]}>{emailToVerify}</Text>

              {/* Steps */}
              <View style={[rs.stepsCard, { backgroundColor: colors.cardInner, borderColor: colors.border }]}>
                {[
                  "Open your email inbox (check spam too)",
                  "Click the verification link in our email",
                  "Return here and tap the button below",
                ].map((step, i) => (
                  <View key={i} style={rs.stepRow}>
                    <View style={[rs.stepNum, { backgroundColor: colors.primary }]}>
                      <Text style={rs.stepNumText}>{i + 1}</Text>
                    </View>
                    <Text style={[rs.stepText, { color: colors.text }]}>{step}</Text>
                  </View>
                ))}
              </View>

              {/* Verified button */}
              <TouchableOpacity
                style={[rs.verifBtn, { backgroundColor: colors.success, opacity: isLoading ? 0.7 : 1 }]}
                onPress={checkVerification}
                disabled={isLoading}
                activeOpacity={0.88}
              >
                {isLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={20} color="#fff" />
                    <Text style={rs.verifBtnText}>I've verified my email</Text>
                  </>
                )}
              </TouchableOpacity>

              {/* Resend */}
              <TouchableOpacity
                style={[rs.resendBtn, { opacity: canResend ? 1 : 0.5 }]}
                onPress={resendVerifEmail}
                disabled={!canResend}
              >
                <Ionicons name="refresh" size={15} color={canResend ? colors.primary : colors.textTertiary} />
                <Text style={{ fontSize: 14, fontWeight: "600", marginLeft: 6, color: canResend ? colors.primary : colors.textTertiary }}>
                  {canResend ? "Resend verification email" : `Resend in ${resendTimer}s`}
                </Text>
              </TouchableOpacity>

              <Text style={[rs.modalNote, { color: colors.textTertiary }]}>
                The verification link is for security purposes only.
              </Text>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const rs = StyleSheet.create({
  root: { flex: 1 },
  page: {
    flexGrow: 1,
    paddingHorizontal: 18,
    paddingTop: Platform.OS === "ios" ? height * 0.04 : 20,
    paddingBottom: 40,
  },

  // Progress
  progressWrap: { marginBottom: 20 },
  progressTrack: { height: 3, borderRadius: 2, overflow: "hidden", marginBottom: 5 },
  progressFill: { height: "100%", borderRadius: 2 },
  progressText: { fontSize: 12, fontWeight: "500", textAlign: "right" },

  // Hero
  hero: { alignItems: "center", marginBottom: 22 },
  logoBox: { width: 76, height: 76, borderRadius: 22, borderWidth: 1, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  logoInner: { width: 50, height: 50, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 24, fontWeight: "700", letterSpacing: -0.4, marginBottom: 5, textAlign: "center" },
  subtitle: { fontSize: 14, textAlign: "center", marginBottom: 14, opacity: 0.85 },
  connPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  connDot: { width: 6, height: 6, borderRadius: 3 },

  // Card
  card: { borderRadius: 20, borderWidth: 1, padding: 20 },

  // Inputs
  row2: { flexDirection: "row", gap: 12, marginBottom: 0 },
  half: { flex: 1 },
  inputRow: { flexDirection: "row", alignItems: "center", borderRadius: 11, paddingHorizontal: 12, height: 48 },
  input: { flex: 1, fontSize: 15, height: "100%" },
  verifiedBadge: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, marginLeft: 8 },

  // Selector sheet
  selectorSheet: { width: "100%", borderRadius: 16, borderWidth: 1, overflow: "hidden", padding: 6 },
  selectorOption: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 13, borderRadius: 9, borderBottomWidth: 0.5, marginBottom: 2 },

  // Banner
  banner: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 16 },
  bannerText: { fontSize: 13, fontWeight: "500", flex: 1 },

  // Submit
  submitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 52, borderRadius: 14, marginBottom: 20 },
  submitText: { color: "#fff", fontSize: 16, fontWeight: "700" },

  // Divider
  divRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  divLine: { flex: 1, height: 1 },
  divText: { fontSize: 12, fontWeight: "500" },

  // Login
  loginBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 48, borderRadius: 12, borderWidth: 1 },
  loginText: { fontSize: 14, fontWeight: "600" },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center", padding: 20 },
  modalSheet: { width: "100%", maxWidth: 400, borderRadius: 22, padding: 24, alignItems: "center" },
  modalIconWrap: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  modalTitle: { fontSize: 20, fontWeight: "700", marginBottom: 6, textAlign: "center" },
  modalSub: { fontSize: 14, textAlign: "center", marginBottom: 4 },
  modalEmail: { fontSize: 15, fontWeight: "600", textAlign: "center", marginBottom: 20 },
  stepsCard: { width: "100%", borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 20, gap: 12 },
  stepRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  stepNum: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 },
  stepNumText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  stepText: { fontSize: 14, flex: 1, lineHeight: 20 },
  verifBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", height: 52, borderRadius: 14, marginBottom: 14 },
  verifBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  resendBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 10, marginBottom: 10 },
  modalNote: { fontSize: 12, textAlign: "center", fontStyle: "italic", paddingHorizontal: 10 },
});