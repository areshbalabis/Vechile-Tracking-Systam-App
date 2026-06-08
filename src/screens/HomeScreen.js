import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  StyleSheet,
  useColorScheme,
  Appearance,
  StatusBar,
  ScrollView,
  Dimensions,
  Platform,
  Animated,
  Easing,
} from "react-native";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { ref, set, update, get } from "firebase/database";
import { auth, realtimeDb } from "../firebase";
import * as NavigationBar from "expo-navigation-bar";
import { useNavigation } from "@react-navigation/native";
import NetInfo from "@react-native-community/netinfo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import {
  Ionicons,
  MaterialCommunityIcons,
} from "@expo/vector-icons";

const { width, height } = Dimensions.get("window");
const LOCATION_TRACKING_TASK = "location-tracking";

// ─── Background task ─────────────────────────────────────────────────────────
TaskManager.defineTask(LOCATION_TRACKING_TASK, async ({ data, error }) => {
  if (error) return console.error("BG task error:", error);
  if (!data?.locations?.length) return;

  const { latitude, longitude, speed, accuracy, heading } =
    data.locations[0].coords;
  const userId = auth.currentUser?.uid;
  if (!userId || !accuracy || accuracy > 40) return;

  const quality =
    accuracy <= 10 ? "excellent"
    : accuracy <= 20 ? "good"
    : accuracy <= 30 ? "fair"
    : "poor";

  try {
    await update(ref(realtimeDb, `drivers/${userId}`), {
      location: {
        latitude,
        longitude,
        speed: speed || 0,
        accuracy,
        heading: heading || 0,
        timestamp: Date.now(),
        quality,
      },
    });
  } catch (e) {
    console.error("Firebase BG update error:", e);
  }
});

// ─── Haptic helper ────────────────────────────────────────────────────────────
const triggerHaptic = (type = "light") => {
  try {
    switch (type) {
      case "success":
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        break;
      case "warning":
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        break;
      case "error":
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        break;
      case "medium":
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        break;
      case "heavy":
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        break;
      default:
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  } catch (_) {}
};

// ─── Theme ────────────────────────────────────────────────────────────────────
const makeColors = (dark) => ({
  primary:       "#3B82F6",
  primaryLight:  "#60A5FA",
  secondary:     "#10B981",
  danger:        "#EF4444",
  dangerTint:    dark ? "rgba(239,68,68,0.12)"   : "rgba(239,68,68,0.08)",
  warning:       "#F59E0B",
  warningTint:   dark ? "rgba(245,158,11,0.12)"  : "rgba(245,158,11,0.08)",
  background:    dark ? "#111827" : "#F3F4F6",
  card:          dark ? "#1F2937" : "#FFFFFF",
  cardInner:     dark ? "#111827" : "#F9FAFB",
  text:          dark ? "#F9FAFB" : "#111827",
  textSecondary: dark ? "#9CA3AF" : "#6B7280",
  textTertiary:  dark ? "#6B7280" : "#9CA3AF",
  border:        dark ? "#374151" : "#E5E7EB",
  primaryTint:   dark ? "rgba(59,130,246,0.12)" : "rgba(59,130,246,0.08)",
  success:       "#10B981",
  successTint:   dark ? "rgba(16,185,129,0.12)"  : "rgba(16,185,129,0.08)",
  muted:         dark ? "#374151" : "#E5E7EB",
  mutedText:     dark ? "#4B5563" : "#D1D5DB",
});

// ─── Accuracy helpers ─────────────────────────────────────────────────────────
const accColor  = (n, c) =>
  n <= 10 ? c.success : n <= 20 ? c.secondary : n <= 30 ? c.warning : n <= 40 ? "#F97316" : c.danger;
const accLabel  = (n) =>
  n <= 10 ? "Excellent" : n <= 20 ? "Good" : n <= 30 ? "Fair" : n <= 40 ? "Poor" : "Very poor";
const accIcon   = (n) =>
  n <= 10 ? "wifi" : n <= 20 ? "wifi-outline" : n <= 30 ? "cellular-outline" : "cloud-offline-outline";
const parseAcc  = (v) => {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    if (["Checking...", "Offline", "Signal lost"].includes(v)) return 100;
    const n = parseFloat(v.replace(/[^0-9.]/g, ""));
    return isNaN(n) ? 100 : n;
  }
  return 100;
};

// ─── Data ─────────────────────────────────────────────────────────────────────
const ROUTES = [
  "Abuyog","Bato","Bontoc","Hilongos","Hinunangan","Liloan",
  "Maasin","Malitbog","Matalom","Sogod","Tomas Oppus",
  "Padre Burgos","Tacloban City",
];

const SEATS = [
  { label: "No available seat", value: "no available seat" },
  ...Array.from({ length: 11 }, (_, i) => ({
    label: `${i} seat${i !== 1 ? "s" : ""}`,
    value: `${i}`,
  })),
];

const VEHICLE_COLORS = [
  "White","Black","Silver","Gray","Red","Blue",
  "Green","Yellow","Orange","Brown","Other",
].map((v) => ({ label: v, value: v.toLowerCase() }));

const BROKEN_PRESETS   = ["Engine overheating","Flat tire","Brake problem","Fuel issue"];
const EMERGENCY_PRESETS = ["Accident","Passenger emergency","Medical emergency","Road blocked"];

// ─── Shared modal shell ───────────────────────────────────────────────────────
function ListModal({ visible, onClose, title, subtitle, iconName, iconColor, iconTint, options, selected, onSelect, children, colors }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[ls.overlay, { backgroundColor: "rgba(0,0,0,0.55)" }]}>
        <View style={[ls.sheet, { backgroundColor: colors.card }]}>
          <View style={ls.sheetHeader}>
            <View style={[ls.sheetIconWrap, { backgroundColor: iconTint }]}>
              {iconName && <Ionicons name={iconName} size={28} color={iconColor} />}
            </View>
            <Text style={[ls.sheetTitle, { color: colors.text }]}>{title}</Text>
            {subtitle && (
              <Text style={[ls.sheetSub, { color: colors.textSecondary }]}>{subtitle}</Text>
            )}
          </View>
          <ScrollView style={{ maxHeight: 240 }} showsVerticalScrollIndicator={false}>
            {options.map((opt, i) => (
              <TouchableOpacity
                key={i}
                style={[
                  ls.sheetOption,
                  {
                    backgroundColor: selected === opt.value ? iconTint : "transparent",
                    borderColor: colors.border,
                  },
                ]}
                onPress={() => {
                  triggerHaptic("light");
                  onSelect(opt);
                }}
              >
                <Text style={[ls.sheetOptionText, { color: colors.text }]}>{opt.label}</Text>
                {selected === opt.value && (
                  <Ionicons name="checkmark" size={18} color={iconColor} />
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
          {children}
          <TouchableOpacity
            style={[ls.sheetCancel, { backgroundColor: colors.cardInner, borderColor: colors.border }]}
            onPress={onClose}
          >
            <Text style={[ls.sheetCancelText, { color: colors.text }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function HomeScreen() {
  const systemScheme = useColorScheme();
  const [themeMode,  setThemeMode]  = useState("automatic");
  const [isDark,     setIsDark]     = useState(systemScheme === "dark");
  const colors = makeColors(isDark);

  // Tracking state
  const [tracking,           setTracking]           = useState(false);
  const [isConnected,        setIsConnected]        = useState(true);
  const [manualStop,         setManualStop]         = useState(false);
  const [isBrokenOrEmergency,setIsBrokenOrEmergency] = useState(false);
  const [currentIssueType,   setCurrentIssueType]   = useState("");
  const [isRepaired,         setIsRepaired]         = useState(false);
  const [repairCountdown,    setRepairCountdown]    = useState(10);
  const [movementBanner,     setMovementBanner]     = useState("");

  // GPS accuracy
  const [locationAccuracy, setLocationAccuracy] = useState("Checking...");
  const [lastUpdate,       setLastUpdate]        = useState(null);
  const [accuracyHistory,  setAccuracyHistory]   = useState([]);
  const [bestAccuracy,     setBestAccuracy]      = useState(null);

  // Driver data
  const [driverName,    setDriverName]    = useState("");
  const [selectedRoute, setSelectedRoute] = useState("");
  const [selectedSeats, setSelectedSeats] = useState("");
  const [phoneNumber,   setPhoneNumber]   = useState("");
  const [vehicleColor,  setVehicleColor]  = useState("");
  const [editName,      setEditName]      = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Session timer
  const [sessionSeconds, setSessionSeconds] = useState(0);

  // Modal visibility
  const [menuVisible,         setMenuVisible]         = useState(false);
  const [editProfileVisible,  setEditProfileVisible]  = useState(false);
  const [showRouteModal,      setShowRouteModal]      = useState(false);
  const [showSeatsModal,      setShowSeatsModal]      = useState(false);
  const [showColorModal,      setShowColorModal]      = useState(false);
  const [brokenPopupVisible,  setBrokenPopupVisible]  = useState(false);
  const [emergencyPopupVisible,setEmergencyPopupVisible] = useState(false);
  const [brokenReason,    setBrokenReason]    = useState("");
  const [emergencyReason, setEmergencyReason] = useState("");

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const navigation = useNavigation();

  // ── System UI ────────────────────────────────────────────────────────────────
  const hideSystemUI = useCallback(() => {
    StatusBar.setHidden(true, "slide");
    NavigationBar.setVisibilityAsync("hidden");
    NavigationBar.setBehaviorAsync("inset-swipe");
    NavigationBar.setPositionAsync("absolute");
    NavigationBar.setBackgroundColorAsync("transparent");
  }, []);

  useEffect(() => {
    hideSystemUI();
    return () => {
      StatusBar.setHidden(false, "slide");
      NavigationBar.setVisibilityAsync("visible");
    };
  }, []);

  // ── Theme ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem("driver_theme_mode").then((saved) => {
      if (!saved) return;
      setThemeMode(saved);
      setIsDark(saved === "automatic" ? systemScheme === "dark" : saved === "dark");
    });
  }, []);

  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      if (themeMode === "automatic") setIsDark(colorScheme === "dark");
    });
    return () => sub.remove();
  }, [themeMode]);

  const handleThemeChange = async (mode) => {
    setThemeMode(mode);
    setIsDark(mode === "automatic" ? systemScheme === "dark" : mode === "dark");
    triggerHaptic("light");
    await AsyncStorage.setItem("driver_theme_mode", mode).catch(() => {});
  };

  // ── Driver data ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    const email = auth.currentUser?.email;
    if (!uid || !email) return;

    (async () => {
      try {
        const snap = await get(ref(realtimeDb, `drivers/${uid}`));
        if (snap.exists()) {
          const d = snap.val();
          const name = d.name || email.split("@")[0];
          setDriverName(name); setEditName(name);
          setPhoneNumber(d.phoneNumber || "");
          setVehicleColor(d.vehicleColor || "");
          setSelectedRoute(d.route || "");
          setSelectedSeats(d.seats || "");
        } else {
          const name = email.split("@")[0];
          await set(ref(realtimeDb, `drivers/${uid}`), {
            name, email, phoneNumber: "", vehicleColor: "", status: "offline",
          });
          setDriverName(name); setEditName(name);
        }
      } catch (err) {
        const name = email.split("@")[0];
        setDriverName(name); setEditName(name);
      }
    })();
  }, []);

  // ── Pulse animation ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!tracking) { pulseAnim.setValue(1); return; }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [tracking]);

  // ── Session timer ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!tracking) { setSessionSeconds(0); return; }
    const t = setInterval(() => setSessionSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [tracking]);

  const formatSession = (s) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  // ── Repair countdown ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isRepaired) return;
    if (repairCountdown > 0) {
      const t = setTimeout(() => setRepairCountdown((c) => c - 1), 1000);
      return () => clearTimeout(t);
    }
    handleGoOnlineAfterRepair();
  }, [isRepaired, repairCountdown]);

  // ── NetInfo ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      setIsConnected((prev) => {
        if (!state.isConnected && prev) {
          triggerHaptic("warning");
          if (tracking) stopTracking(false);
          Alert.alert("Connection lost", "Internet required for real-time tracking.");
        } else if (state.isConnected && !prev) {
          triggerHaptic("success");
        }
        return state.isConnected ?? true;
      });
    });
    return () => unsub();
  }, [tracking]);

  // ── GPS accuracy monitor ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!tracking) return;
    const check = async () => {
      try {
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.BestForNavigation,
          timeout: 10000,
        });
        const acc = Math.round(pos.coords.accuracy);
        setLocationAccuracy(acc);
        setLastUpdate(new Date());
        setBestAccuracy((b) => (b === null || acc < b ? acc : b));
        setAccuracyHistory((h) => [...h, { accuracy: acc, timestamp: Date.now() }].slice(-10));
      } catch {
        setLocationAccuracy("Signal lost");
      }
    };
    check();
    const interval = setInterval(check, 20000);
    return () => clearInterval(interval);
  }, [tracking]);

  const avgAccuracy = () => {
    if (!accuracyHistory.length) return null;
    return Math.round(accuracyHistory.reduce((a, c) => a + c.accuracy, 0) / accuracyHistory.length);
  };

  const formatLastUpdate = () => {
    if (!lastUpdate) return "—";
    const diff = Math.floor((Date.now() - lastUpdate) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  };

  // ── Permissions ────────────────────────────────────────────────────────────────
  const requestPermissions = async () => {
    const { status: fg } = await Location.requestForegroundPermissionsAsync();
    const { status: bg } = await Location.requestBackgroundPermissionsAsync();
    if (fg !== "granted" || bg !== "granted") {
      Alert.alert("Location required", "Please allow background location access in settings.");
      return false;
    }
    await Location.enableNetworkProviderAsync().catch(() => {});
    hideSystemUI();
    return true;
  };

  // ── Start tracking ─────────────────────────────────────────────────────────────
  const startTracking = async () => {
    triggerHaptic("medium");
    if (!isConnected) {
      Alert.alert("No internet", "Internet connection required for real-time tracking.");
      triggerHaptic("warning");
      return;
    }
    const ok = await requestPermissions();
    if (!ok) return;

    setManualStop(false);
    setIsBrokenOrEmergency(false);
    setIsRepaired(false);
    setCurrentIssueType("");
    setAccuracyHistory([]);
    setBestAccuracy(null);

    const registered = await TaskManager.isTaskRegisteredAsync(LOCATION_TRACKING_TASK);
    if (!registered) {
      try {
        await Location.startLocationUpdatesAsync(LOCATION_TRACKING_TASK, {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 3000,
          distanceInterval: 5,
          enablesBackgroundLocationUpdates: true,
          showsBackgroundLocationIndicator: true,
          pausesUpdatesAutomatically: false,
          activityType: Location.ActivityType.AutomotiveNavigation,
          foregroundService: {
            notificationTitle: "Vehicle Tracking Active",
            notificationBody: "Sharing precise location…",
            notificationColor: colors.primary,
          },
        });
      } catch (e) {
        Alert.alert("Tracking error", "Failed to start location tracking.");
        return;
      }
    }

    hideSystemUI();

    try {
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
        maximumAge: 10000,
        timeout: 15000,
      });
      const { latitude, longitude, accuracy, speed, heading } = pos.coords;
      const acc = pos.coords.accuracy;
      const uid = auth.currentUser?.uid;

      if (acc > 50) {
        Alert.alert("GPS notice", `Initial accuracy is ${Math.round(acc)}m. For best results keep phone on dashboard.`);
      }

      if (uid) {
        await update(ref(realtimeDb, `drivers/${uid}`), {
          status: "online",
          reason: null,
          issueType: null,
          location: {
            latitude, longitude, accuracy: acc,
            speed: speed || 0, heading: heading || 0,
            timestamp: Date.now(),
            quality: acc <= 10 ? "excellent" : acc <= 20 ? "good" : acc <= 30 ? "fair" : "poor",
          },
        });
        setLocationAccuracy(Math.round(acc));
        setLastUpdate(new Date());
        setBestAccuracy(acc);
        setAccuracyHistory([{ accuracy: Math.round(acc), timestamp: Date.now() }]);
      }
    } catch {
      Alert.alert("GPS error", "Could not get initial position. Check GPS is enabled.");
    }

    setTracking(true);
    triggerHaptic("success");
    Alert.alert("Online", "Vehicle tracking started.");
  };

  // ── Stop tracking ──────────────────────────────────────────────────────────────
  const stopTracking = async (isManual = true) => {
    triggerHaptic("medium");
    const registered = await TaskManager.isTaskRegisteredAsync(LOCATION_TRACKING_TASK);
    if (registered) {
      await Location.stopLocationUpdatesAsync(LOCATION_TRACKING_TASK).catch(() => {});
    }
    const uid = auth.currentUser?.uid;
    if (uid) {
      await update(ref(realtimeDb, `drivers/${uid}`), {
        status: "offline", reason: null, route: "End Trip", issueType: null,
      });
    }
    setTracking(false);
    setLocationAccuracy("Offline");
    setLastUpdate(null);
    if (isManual) setManualStop(true);
    Alert.alert("Offline", "Vehicle tracking stopped.");
  };

  // ── Update route / seats ───────────────────────────────────────────────────────
  const updateRoute = async (route) => {
    setSelectedRoute(route);
    const uid = auth.currentUser?.uid;
    if (uid) await update(ref(realtimeDb, `drivers/${uid}`), { route }).catch(() => {});
  };

  const updateSeats = async (value) => {
    setSelectedSeats(value);
    const seatStatus = value === "no available seat" ? "no available seat" : `Available Seats - ${value}`;
    const uid = auth.currentUser?.uid;
    if (uid) await update(ref(realtimeDb, `drivers/${uid}`), { status: seatStatus, seats: value }).catch(() => {});
  };

  // ── Issue reporting ────────────────────────────────────────────────────────────
  const reportIssue = async (reason, issueType) => {
    triggerHaptic("heavy");
    const uid = auth.currentUser?.uid;
    const registered = await TaskManager.isTaskRegisteredAsync(LOCATION_TRACKING_TASK);
    if (registered) await Location.stopLocationUpdatesAsync(LOCATION_TRACKING_TASK).catch(() => {});
    await update(ref(realtimeDb, `drivers/${uid}`), {
      status: "offline", reason, issueType,
      vehicleStatus: "Pending repair…",
    }).catch(() => {});
    setTracking(false);
    setIsBrokenOrEmergency(true);
    setCurrentIssueType(issueType);
    setManualStop(true);
    setLocationAccuracy("Offline");
    setLastUpdate(null);
  };

  const submitBrokenReason = async () => {
    if (!brokenReason) { triggerHaptic("error"); Alert.alert("Required", "Please select or type a reason."); return; }
    await reportIssue(brokenReason, "broken vehicle");
    setBrokenReason(""); setBrokenPopupVisible(false);
    Alert.alert("Issue reported", "Press 'Done — fixed' when resolved.");
  };

  const submitEmergencyReason = async () => {
    if (!emergencyReason) { triggerHaptic("error"); Alert.alert("Required", "Please select or type a reason."); return; }
    await reportIssue(emergencyReason, "emergency");
    setEmergencyReason(""); setEmergencyPopupVisible(false);
    Alert.alert("Emergency reported", "Press 'Done — fixed' when resolved.");
  };

  const handleDoneFix = async () => {
    triggerHaptic("success");
    const uid = auth.currentUser?.uid;
    await update(ref(realtimeDb, `drivers/${uid}`), {
      vehicleStatus: "repaired", reason: null, issueType: null,
    }).catch(() => {});
    setCurrentIssueType(""); setIsBrokenOrEmergency(false); setManualStop(false);
    setIsRepaired(true); setRepairCountdown(10);
    setMovementBanner("Issue resolved — back to service in 10 seconds…");
  };

  const handleGoOnlineAfterRepair = async () => {
    const uid = auth.currentUser?.uid;
    await update(ref(realtimeDb, `drivers/${uid}`), { vehicleStatus: null }).catch(() => {});
    setIsRepaired(false); setMovementBanner("Ready to drive…");
    setTimeout(async () => {
      await startTracking();
      setMovementBanner("On trip!");
      setTimeout(() => setMovementBanner(""), 3000);
    }, 500);
  };

  // ── Profile ────────────────────────────────────────────────────────────────────
  const handleSaveProfile = async () => {
    if (!editName.trim()) { triggerHaptic("error"); Alert.alert("Required", "Name is required."); return; }
    setIsSavingProfile(true);
    try {
      const uid = auth.currentUser?.uid;
      await update(ref(realtimeDb, `drivers/${uid}`), {
        name: editName.trim(), phoneNumber: phoneNumber.trim(), vehicleColor,
      });
      setDriverName(editName.trim()); setEditProfileVisible(false);
      triggerHaptic("success");
      Alert.alert("Saved", "Profile updated successfully.");
    } catch {
      triggerHaptic("error"); Alert.alert("Error", "Failed to update profile.");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleSignout = async () => {
    triggerHaptic("medium");
    const uid = auth.currentUser?.uid;
    if (uid) {
      await update(ref(realtimeDb, `drivers/${uid}`), {
        status: "offline", reason: null, route: "End Trip", issueType: null,
      }).catch(() => {});
    }
    await auth.signOut().catch(() => {});
    navigation.replace("Login");
  };

  // ─── Derived values ────────────────────────────────────────────────────────────
  const accNum  = parseAcc(locationAccuracy);
  const initials =
    driverName ? driverName.charAt(0).toUpperCase()
    : auth.currentUser?.email?.charAt(0).toUpperCase() || "D";

  const seatDisplay =
    selectedSeats === "no available seat" ? "No available seat"
    : selectedSeats ? `${selectedSeats} seat${selectedSeats !== "1" ? "s" : ""}`
    : "Select seats";

  // ─── Issue reason modal (shared) ──────────────────────────────────────────────
  const IssueModal = ({ visible, onClose, title, presets, reason, setReason, onSubmit, accentColor, accentTint, iconName }) => (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[ls.overlay, { backgroundColor: "rgba(0,0,0,0.55)" }]}>
        <View style={[ls.sheet, { backgroundColor: colors.card }]}>
          <View style={ls.sheetHeader}>
            <View style={[ls.sheetIconWrap, { backgroundColor: accentTint }]}>
              <Ionicons name={iconName} size={28} color={accentColor} />
            </View>
            <Text style={[ls.sheetTitle, { color: colors.text }]}>{title}</Text>
            <Text style={[ls.sheetSub, { color: colors.textSecondary }]}>
              Select a preset or type your own
            </Text>
          </View>
          <ScrollView style={{ maxHeight: 200 }} showsVerticalScrollIndicator={false}>
            {presets.map((p, i) => (
              <TouchableOpacity
                key={i}
                style={[ls.sheetOption, {
                  backgroundColor: reason === p ? accentTint : "transparent",
                  borderColor: colors.border,
                }]}
                onPress={() => { triggerHaptic("light"); setReason(p); }}
              >
                <Text style={[ls.sheetOptionText, { color: colors.text }]}>{p}</Text>
                {reason === p && <Ionicons name="checkmark" size={18} color={accentColor} />}
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder="Or type your reason…"
            placeholderTextColor={colors.textTertiary}
            style={[ls.sheetInput, { backgroundColor: colors.cardInner, color: colors.text, borderColor: colors.border }]}
          />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <TouchableOpacity
              style={[ls.sheetCancel, { flex: 1, backgroundColor: colors.cardInner, borderColor: colors.border }]}
              onPress={onClose}
            >
              <Text style={[ls.sheetCancelText, { color: colors.text }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[ls.sheetSubmit, { flex: 1, backgroundColor: accentColor, opacity: reason ? 1 : 0.4 }]}
              onPress={onSubmit}
              disabled={!reason}
            >
              <Text style={ls.sheetSubmitText}>Report</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  // ─── Render ────────────────────────────────────────────────────────────────────
  return (
    <ScrollView
      style={[s.root, { backgroundColor: colors.background }]}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 36 }}
    >
      {/* ── Header ── */}
      <View style={[s.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={s.headerLeft}>
          <Text style={[s.greeting, { color: colors.textSecondary }]}>Welcome back,</Text>
          <Text style={[s.driverName, { color: colors.text }]} numberOfLines={1}>
            {driverName || "Driver"}
          </Text>
        </View>
        <View style={s.headerRight}>
          {tracking && (
            <View style={[s.sessionBadge, { backgroundColor: colors.primaryTint }]}>
              <View style={[s.sessionDot, { backgroundColor: colors.primary }]} />
              <Text style={[s.sessionText, { color: colors.primaryLight }]}>
                {formatSession(sessionSeconds)}
              </Text>
            </View>
          )}
          <TouchableOpacity
            style={[s.avatar, { backgroundColor: colors.primary }]}
            onPress={() => { triggerHaptic("light"); setMenuVisible(true); }}
          >
            <Text style={s.avatarText}>{initials}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Connection banner ── */}
      {!isConnected && (
        <View style={[s.banner, { backgroundColor: colors.dangerTint, borderColor: colors.danger + "40" }]}>
          <Ionicons name="cloud-offline" size={16} color={colors.danger} />
          <Text style={[s.bannerText, { color: colors.danger }]}>
            No internet — tracking paused
          </Text>
        </View>
      )}

      {/* ── Movement / status banner ── */}
      {movementBanner !== "" && (
        <View style={[s.banner, { backgroundColor: colors.successTint, borderColor: colors.success + "40" }]}>
          <Ionicons name="checkmark-circle" size={16} color={colors.success} />
          <Text style={[s.bannerText, { color: colors.success }]}>{movementBanner}</Text>
        </View>
      )}

      {/* ── Repair countdown banner ── */}
      {isRepaired && (
        <View style={[s.banner, { backgroundColor: colors.primaryTint, borderColor: colors.primary + "40" }]}>
          <Ionicons name="timer-outline" size={16} color={colors.primary} />
          <Text style={[s.bannerText, { color: colors.primaryLight }]}>
            Repaired — back to service in {repairCountdown}s
          </Text>
        </View>
      )}

      {/* ── Quick status pills ── */}
      <View style={s.pillRow}>
        <View style={[s.pill, {
          backgroundColor: tracking ? colors.successTint : colors.muted,
          borderColor: tracking ? colors.success + "40" : colors.border,
        }]}>
          <View style={[s.pillDot, { backgroundColor: tracking ? colors.success : colors.mutedText }]} />
          <Text style={[s.pillText, { color: tracking ? colors.success : colors.textSecondary }]}>
            {tracking ? "Online" : isRepaired ? "Repairing" : "Offline"}
          </Text>
        </View>

        {tracking && (
          <View style={[s.pill, {
            backgroundColor: colors.primaryTint,
            borderColor: colors.primary + "40",
          }]}>
            <Ionicons name={accIcon(accNum)} size={12} color={colors.primaryLight} />
            <Text style={[s.pillText, { color: colors.primaryLight }]}>
              GPS · {typeof locationAccuracy === "number" ? `${locationAccuracy}m` : locationAccuracy} · {accLabel(accNum)}
            </Text>
          </View>
        )}
      </View>

      {/* ── Status card ── */}
      <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={s.statusRow}>
          <Animated.View
            style={[
              s.statusDot,
              {
                backgroundColor:
                  tracking ? colors.primary
                  : isRepaired ? colors.success
                  : colors.muted,
                transform: [{ scale: pulseAnim }],
              },
            ]}
          >
            <Ionicons
              name={tracking ? "location" : isRepaired ? "checkmark-circle" : "location-outline"}
              size={24}
              color={tracking || isRepaired ? "#FFFFFF" : colors.textSecondary}
            />
          </Animated.View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={[s.statusTitle, { color: colors.text }]}>
              {isRepaired ? "Repaired — returning to service"
               : tracking ? "Vehicle tracking active"
               : "Vehicle offline"}
            </Text>
            <Text style={[s.statusSub, { color: colors.textSecondary }]}>
              {isRepaired ? "Countdown started"
               : tracking ? `Sharing real-time location · updated ${formatLastUpdate()}`
               : "Start tracking to go online"}
            </Text>
          </View>
        </View>

        {/* GPS accuracy mini-dashboard */}
        {tracking && accuracyHistory.length > 0 && (
          <>
            <View style={[s.divider, { backgroundColor: colors.border }]} />
            <View style={s.accGrid}>
              {[
                { label: "Best", value: bestAccuracy != null ? `${bestAccuracy}m` : "—", color: colors.success },
                { label: "Avg",  value: avgAccuracy() != null ? `${avgAccuracy()}m` : "—", color: colors.primaryLight },
                { label: "Now",  value: typeof locationAccuracy === "number" ? `${locationAccuracy}m` : locationAccuracy, color: accColor(accNum, colors) },
                { label: "Samples", value: `${accuracyHistory.length}`, color: colors.textSecondary },
              ].map((stat, i) => (
                <View key={i} style={[s.accCell, { backgroundColor: colors.primaryTint }]}>
                  <Text style={[s.accCellLabel, { color: colors.textSecondary }]}>{stat.label}</Text>
                  <Text style={[s.accCellValue, { color: stat.color }]}>{stat.value}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </View>

      {/* ── Action grid ── */}
      <View style={s.actionGrid}>
        {/* Go Online */}
        <ActionCard
          title={tracking || isRepaired ? "Online" : "Go online"}
          subtitle={tracking ? "Active" : "Tap to start"}
          iconName={tracking || isRepaired ? "checkmark-circle" : "play-circle"}
          active={tracking || isRepaired}
          activeColor={colors.primary}
          activeTint={colors.primaryTint}
          colors={colors}
          onPress={startTracking}
          disabled={tracking || isBrokenOrEmergency || isRepaired}
        />

        {/* Go Offline */}
        <ActionCard
          title={!tracking && !isRepaired ? "Offline" : "Go offline"}
          subtitle={!tracking && !isRepaired ? "Inactive" : "Tap to stop"}
          iconName={!tracking && !isRepaired ? "stop-circle-outline" : "stop-circle"}
          active={!tracking && !isRepaired}
          activeColor={colors.textSecondary}
          activeTint={colors.muted}
          colors={colors}
          onPress={() => stopTracking(true)}
          disabled={!tracking || isRepaired}
        />

        {/* Vehicle issue */}
        <ActionCard
          title={isBrokenOrEmergency && currentIssueType === "broken vehicle" ? "Issue active" : "Vehicle issue"}
          subtitle={isBrokenOrEmergency ? "Pending fix" : "Report problem"}
          iconName="construct"
          active={isBrokenOrEmergency && currentIssueType === "broken vehicle"}
          activeColor={colors.warning}
          activeTint={colors.warningTint}
          colors={colors}
          onPress={() => { triggerHaptic("light"); setBrokenPopupVisible(true); }}
          disabled={isBrokenOrEmergency || isRepaired}
          useIoni
        />

        {/* Emergency */}
        <ActionCard
          title={isBrokenOrEmergency && currentIssueType === "emergency" ? "Emergency active" : "Emergency"}
          subtitle={isBrokenOrEmergency ? "Reported" : "Alert dispatch"}
          iconName={isBrokenOrEmergency && currentIssueType === "emergency" ? "alert-circle" : "alert-circle-outline"}
          active={isBrokenOrEmergency && currentIssueType === "emergency"}
          activeColor={colors.danger}
          activeTint={colors.dangerTint}
          colors={colors}
          onPress={() => { triggerHaptic("light"); setEmergencyPopupVisible(true); }}
          disabled={isBrokenOrEmergency || isRepaired}
          useIoni
        />
      </View>

      {/* ── Done Fix button ── */}
      {isBrokenOrEmergency && !isRepaired && (
        <TouchableOpacity
          style={[s.doneFixBtn, { backgroundColor: colors.success }]}
          onPress={handleDoneFix}
          activeOpacity={0.85}
        >
          <Ionicons name="checkmark-done-circle" size={22} color="#FFFFFF" />
          <Text style={s.doneFixText}>Done — fixed</Text>
        </TouchableOpacity>
      )}

      {/* ── Settings card ── */}
      <View style={[s.card, s.cardMarginTop, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[s.sectionTitle, { color: colors.text }]}>Vehicle settings</Text>

        <PickerRow
          icon="map"
          label="Route"
          value={selectedRoute || "Select your route"}
          hasValue={!!selectedRoute}
          disabled={!tracking}
          hint={!tracking && !isRepaired ? "Go online to select a route" : null}
          colors={colors}
          onPress={() => { triggerHaptic("light"); setShowRouteModal(true); }}
        />

        <PickerRow
          icon="people"
          label="Available seats"
          value={seatDisplay}
          hasValue={!!selectedSeats}
          disabled={!tracking}
          hint={!tracking && !isRepaired ? "Go online to update seats" : null}
          colors={colors}
          onPress={() => { triggerHaptic("light"); setShowSeatsModal(true); }}
        />

        {tracking && (
          <View style={[s.tipCard, { backgroundColor: colors.primaryTint, borderColor: colors.primary + "25" }]}>
            <Ionicons name="information-circle" size={18} color={colors.primaryLight} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={[s.tipTitle, { color: colors.text }]}>GPS accuracy tips</Text>
              <Text style={[s.tipText, { color: colors.textSecondary }]}>
                Keep phone on dashboard · avoid tunnels · best: 1–20m · fair: 21–40m
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* ── Profile menu modal ── */}
      <Modal visible={menuVisible} animationType="slide" transparent onRequestClose={() => setMenuVisible(false)}>
        <View style={[ls.overlay, { backgroundColor: "rgba(0,0,0,0.55)" }]}>
          <View style={[ls.menuSheet, { backgroundColor: colors.card }]}>
            {/* Profile header */}
            <View style={ls.menuProfileRow}>
              <View style={[ls.menuAvatar, { backgroundColor: colors.primaryTint }]}>
                <Text style={[ls.menuAvatarText, { color: colors.primary }]}>{initials}</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[ls.menuName, { color: colors.text }]}>{driverName || "Driver"}</Text>
                <Text style={[ls.menuEmail, { color: colors.textSecondary }]} numberOfLines={1}>
                  {auth.currentUser?.email}
                </Text>
              </View>
              <TouchableOpacity onPress={() => { triggerHaptic("light"); setMenuVisible(false); }}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={[ls.divider, { backgroundColor: colors.border }]} />

            {/* Theme section */}
            <Text style={[ls.menuSectionLabel, { color: colors.textTertiary }]}>Appearance</Text>
            {[
              { mode: "automatic", icon: "contrast",  label: "Automatic" },
              { mode: "light",     icon: "sunny",      label: "Light" },
              { mode: "dark",      icon: "moon",       label: "Dark" },
            ].map(({ mode, icon, label }) => (
              <TouchableOpacity key={mode} style={ls.menuRow} onPress={() => handleThemeChange(mode)}>
                <View style={ls.menuRowLeft}>
                  <Ionicons name={icon} size={20} color={themeMode === mode ? colors.primary : colors.textSecondary} />
                  <Text style={[ls.menuRowText, { color: colors.text }]}>{label}</Text>
                </View>
                {themeMode === mode && <Ionicons name="checkmark" size={18} color={colors.primary} />}
              </TouchableOpacity>
            ))}

            <View style={[ls.divider, { backgroundColor: colors.border }]} />

            <TouchableOpacity
              style={ls.menuRow}
              onPress={() => { triggerHaptic("light"); setMenuVisible(false); setEditProfileVisible(true); }}
            >
              <View style={ls.menuRowLeft}>
                <Ionicons name="person-circle" size={20} color={colors.primary} />
                <Text style={[ls.menuRowText, { color: colors.text }]}>Edit profile</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </TouchableOpacity>

            <View style={[ls.divider, { backgroundColor: colors.border }]} />

            <TouchableOpacity
              style={[ls.menuSignOut, { backgroundColor: colors.danger }]}
              onPress={handleSignout}
            >
              <Ionicons name="log-out-outline" size={18} color="#FFF" />
              <Text style={ls.menuSignOutText}>Sign out</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Edit profile modal ── */}
      <Modal visible={editProfileVisible} animationType="slide" transparent onRequestClose={() => setEditProfileVisible(false)}>
        <View style={[ls.overlay, { backgroundColor: "rgba(0,0,0,0.55)" }]}>
          <ScrollView style={[ls.editSheet, { backgroundColor: colors.card }]} contentContainerStyle={{ padding: 20 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <Text style={[ls.sheetTitle, { color: colors.text }]}>Edit profile</Text>
              <TouchableOpacity onPress={() => { triggerHaptic("light"); setEditProfileVisible(false); }}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {[
              { label: "Name", value: editName, set: setEditName, keyboard: "default" },
              { label: "Phone number", value: phoneNumber, set: setPhoneNumber, keyboard: "phone-pad" },
            ].map(({ label, value, set, keyboard }) => (
              <View key={label} style={{ marginBottom: 18 }}>
                <Text style={[ls.fieldLabel, { color: colors.textSecondary }]}>{label}</Text>
                <TextInput
                  value={value}
                  onChangeText={set}
                  placeholder={`Enter ${label.toLowerCase()}`}
                  placeholderTextColor={colors.textTertiary}
                  keyboardType={keyboard}
                  style={[ls.sheetInput, { backgroundColor: colors.cardInner, color: colors.text, borderColor: colors.border }]}
                />
              </View>
            ))}

            <View style={{ marginBottom: 24 }}>
              <Text style={[ls.fieldLabel, { color: colors.textSecondary }]}>Vehicle color</Text>
              <TouchableOpacity
                style={[ls.sheetInput, ls.pickerBtn, { backgroundColor: colors.cardInner, borderColor: colors.border }]}
                onPress={() => { triggerHaptic("light"); setShowColorModal(true); }}
              >
                <Text style={{ color: vehicleColor ? colors.text : colors.textTertiary, fontSize: 15 }}>
                  {vehicleColor ? vehicleColor.charAt(0).toUpperCase() + vehicleColor.slice(1) : "Select color"}
                </Text>
                <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[ls.sheetSubmit, { backgroundColor: colors.primary, marginBottom: 10 }]}
              onPress={handleSaveProfile}
              disabled={isSavingProfile}
            >
              <Text style={ls.sheetSubmitText}>{isSavingProfile ? "Saving…" : "Save profile"}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[ls.sheetCancel, { backgroundColor: colors.cardInner, borderColor: colors.border }]}
              onPress={() => { triggerHaptic("light"); setEditProfileVisible(false); }}
            >
              <Text style={[ls.sheetCancelText, { color: colors.text }]}>Cancel</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* ── Route modal ── */}
      <ListModal
        visible={showRouteModal}
        onClose={() => setShowRouteModal(false)}
        title="Select route"
        subtitle="Choose your current route"
        iconName="map"
        iconColor={colors.primary}
        iconTint={colors.primaryTint}
        options={ROUTES.map((r) => ({ label: r, value: r }))}
        selected={selectedRoute}
        onSelect={(opt) => {
          updateRoute(opt.value);
          setShowRouteModal(false);
          Alert.alert("Route updated", opt.value);
        }}
        colors={colors}
      />

      {/* ── Seats modal ── */}
      <ListModal
        visible={showSeatsModal}
        onClose={() => setShowSeatsModal(false)}
        title="Available seats"
        subtitle="Select number of available seats"
        iconName="people"
        iconColor={colors.secondary}
        iconTint={colors.successTint}
        options={SEATS}
        selected={selectedSeats}
        onSelect={(opt) => {
          updateSeats(opt.value);
          setShowSeatsModal(false);
          Alert.alert("Seats updated", opt.label);
        }}
        colors={colors}
      />

      {/* ── Color modal ── */}
      <ListModal
        visible={showColorModal}
        onClose={() => setShowColorModal(false)}
        title="Vehicle color"
        subtitle="Select your vehicle color"
        iconName="color-palette"
        iconColor={colors.primary}
        iconTint={colors.primaryTint}
        options={VEHICLE_COLORS}
        selected={vehicleColor}
        onSelect={(opt) => {
          setVehicleColor(opt.value);
          setShowColorModal(false);
        }}
        colors={colors}
      />

      {/* ── Broken vehicle modal ── */}
      <IssueModal
        visible={brokenPopupVisible}
        onClose={() => { setBrokenPopupVisible(false); setBrokenReason(""); }}
        title="Vehicle issue"
        presets={BROKEN_PRESETS}
        reason={brokenReason}
        setReason={setBrokenReason}
        onSubmit={submitBrokenReason}
        accentColor={colors.warning}
        accentTint={colors.warningTint}
        iconName="construct"
      />

      {/* ── Emergency modal ── */}
      <IssueModal
        visible={emergencyPopupVisible}
        onClose={() => { setEmergencyPopupVisible(false); setEmergencyReason(""); }}
        title="Emergency"
        presets={EMERGENCY_PRESETS}
        reason={emergencyReason}
        setReason={setEmergencyReason}
        onSubmit={submitEmergencyReason}
        accentColor={colors.danger}
        accentTint={colors.dangerTint}
        iconName="alert-circle"
      />
    </ScrollView>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────
function ActionCard({ title, subtitle, iconName, active, activeColor, activeTint, colors, onPress, disabled, useIoni = true }) {
  return (
    <TouchableOpacity
      style={[s.actionCard, {
        backgroundColor: colors.card,
        borderColor: active ? activeColor + "50" : colors.border,
        borderWidth: active ? 1.5 : 1,
        opacity: disabled && !active ? 0.45 : 1,
      }]}
      onPress={() => { triggerHaptic("light"); onPress(); }}
      disabled={disabled}
      activeOpacity={0.75}
    >
      <View style={[s.actionIcon, { backgroundColor: active ? activeTint : colors.muted }]}>
        <Ionicons name={iconName} size={26} color={active ? activeColor : colors.textSecondary} />
      </View>
      <Text style={[s.actionTitle, { color: active ? colors.text : colors.textSecondary }]}>{title}</Text>
      <Text style={[s.actionSub, { color: colors.textTertiary }]}>{subtitle}</Text>
    </TouchableOpacity>
  );
}

function PickerRow({ icon, label, value, hasValue, disabled, hint, colors, onPress }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6, gap: 6 }}>
        <Ionicons name={icon} size={18} color={colors.primary} />
        <Text style={[s.settingLabel, { color: colors.textSecondary }]}>{label}</Text>
      </View>
      <TouchableOpacity
        style={[s.picker, {
          backgroundColor: colors.cardInner,
          borderColor: colors.border,
          opacity: disabled ? 0.5 : 1,
        }]}
        onPress={onPress}
        disabled={disabled}
        activeOpacity={0.7}
      >
        <Text style={[s.pickerText, { color: hasValue ? colors.text : colors.textTertiary }]}>{value}</Text>
        <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
      </TouchableOpacity>
      {hint && <Text style={[s.pickerHint, { color: colors.danger }]}>{hint}</Text>}
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1 },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "ios" ? 54 : 24,
    paddingBottom: 18,
    borderBottomWidth: 1,
  },
  headerLeft: { flex: 1, marginRight: 12 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  greeting: { fontSize: 13, fontWeight: "400", marginBottom: 2 },
  driverName: { fontSize: 22, fontWeight: "700", letterSpacing: -0.4 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#FFFFFF", fontSize: 17, fontWeight: "700" },
  sessionBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12,
  },
  sessionDot: { width: 6, height: 6, borderRadius: 3 },
  sessionText: { fontSize: 12, fontWeight: "600" },

  // Banners
  banner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginHorizontal: 16, marginTop: 12, padding: 10,
    borderRadius: 10, borderWidth: 1,
  },
  bannerText: { fontSize: 13, fontWeight: "500", flex: 1 },

  // Pills
  pillRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, marginTop: 12, flexWrap: "wrap" },
  pill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, borderWidth: 1,
  },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: 12, fontWeight: "500" },

  // Card
  card: {
    marginHorizontal: 16, marginTop: 14,
    borderRadius: 16, borderWidth: 1, padding: 16,
  },
  cardMarginTop: { marginTop: 20 },
  divider: { height: 1, marginVertical: 12 },

  // Status card
  statusRow: { flexDirection: "row", alignItems: "center" },
  statusDot: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  statusTitle: { fontSize: 16, fontWeight: "700", marginBottom: 3 },
  statusSub: { fontSize: 13 },

  // Accuracy grid
  accGrid: { flexDirection: "row", gap: 8 },
  accCell: { flex: 1, borderRadius: 10, padding: 8, alignItems: "center" },
  accCellLabel: { fontSize: 10, fontWeight: "500", marginBottom: 2 },
  accCellValue: { fontSize: 14, fontWeight: "700" },

  // Action grid
  actionGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 16, marginTop: 14, gap: 10 },
  actionCard: {
    width: (width - 42) / 2, borderRadius: 14, padding: 14,
    alignItems: "flex-start",
  },
  actionIcon: { width: 46, height: 46, borderRadius: 13, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  actionTitle: { fontSize: 14, fontWeight: "700", marginBottom: 2 },
  actionSub: { fontSize: 11 },

  // Done fix
  doneFixBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    marginHorizontal: 16, marginTop: 14, padding: 15, borderRadius: 14,
  },
  doneFixText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },

  // Settings
  sectionTitle: { fontSize: 16, fontWeight: "700", marginBottom: 16 },
  settingLabel: { fontSize: 13, fontWeight: "500" },
  picker: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, borderWidth: 1,
  },
  pickerText: { fontSize: 15, flex: 1 },
  pickerHint: { fontSize: 11, marginTop: 4, fontStyle: "italic" },
  tipCard: {
    flexDirection: "row", alignItems: "flex-start", padding: 12,
    borderRadius: 10, borderWidth: 1, marginTop: 6,
  },
  tipTitle: { fontSize: 13, fontWeight: "600", marginBottom: 2 },
  tipText: { fontSize: 12, lineHeight: 17 },
});

// Modal/sheet styles
const ls = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "center", alignItems: "center", padding: 20 },
  sheet: {
    width: "100%", maxWidth: 400, borderRadius: 22,
    padding: 20, maxHeight: height * 0.85,
  },
  sheetHeader: { alignItems: "center", marginBottom: 16 },
  sheetIconWrap: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  sheetTitle: { fontSize: 20, fontWeight: "700", marginBottom: 2, textAlign: "center" },
  sheetSub: { fontSize: 13, textAlign: "center" },
  sheetOption: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: 13, borderRadius: 10, borderBottomWidth: 1, marginBottom: 4,
  },
  sheetOptionText: { fontSize: 14, fontWeight: "500", flex: 1 },
  sheetInput: {
    padding: 13, borderRadius: 10, borderWidth: 1, fontSize: 15,
    marginTop: 10, marginBottom: 14,
  },
  sheetCancel: {
    padding: 14, borderRadius: 10, borderWidth: 1, alignItems: "center",
  },
  sheetCancelText: { fontSize: 15, fontWeight: "600" },
  sheetSubmit: { padding: 14, borderRadius: 10, alignItems: "center" },
  sheetSubmitText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  pickerBtn: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  divider: { height: 1, marginVertical: 14 },
  fieldLabel: { fontSize: 13, fontWeight: "500", marginBottom: 6 },

  // Menu sheet
  menuSheet: {
    width: "100%", maxWidth: 400, borderRadius: 22, padding: 20,
  },
  menuProfileRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  menuAvatar: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  menuAvatarText: { fontSize: 20, fontWeight: "700" },
  menuName: { fontSize: 16, fontWeight: "700" },
  menuEmail: { fontSize: 13, marginTop: 1 },
  menuSectionLabel: { fontSize: 11, fontWeight: "600", letterSpacing: 0.7, marginBottom: 8, textTransform: "uppercase" },
  menuRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12 },
  menuRowLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  menuRowText: { fontSize: 15, fontWeight: "500" },
  menuSignOut: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    padding: 14, borderRadius: 12, marginTop: 4,
  },
  menuSignOutText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },

  // Edit profile sheet
  editSheet: {
    width: "100%", maxWidth: 400, maxHeight: height * 0.85, borderRadius: 22,
  },
});