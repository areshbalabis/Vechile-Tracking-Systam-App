import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
  Animated,
  Easing,
  ScrollView,
  Dimensions,
  Platform,
  useColorScheme,
  StatusBar,
} from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE, AnimatedRegion } from "react-native-maps";
import { ref, onValue } from "firebase/database";
import { auth, realtimeDb } from "../firebase";
import { useNavigation } from "@react-navigation/native";
import * as Location from "expo-location";
import { signOut } from "firebase/auth";
import NetInfo from "@react-native-community/netinfo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { MaterialCommunityIcons, Ionicons, FontAwesome5, FontAwesome } from "@expo/vector-icons";
import Modal from "react-native-modal";
import * as NavigationBar from "expo-navigation-bar";
import * as Haptics from "expo-haptics";

const { height } = Dimensions.get("window");

// ─── Haptic helper ────────────────────────────────────────────────────────────
const haptic = (type = "light") => {
  try {
    switch (type) {
      case "success": Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); break;
      case "warning": Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); break;
      case "error":   Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);   break;
      case "medium":  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);             break;
      case "heavy":   Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);              break;
      default:        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  } catch (_) {}
};

// ─── Theme ────────────────────────────────────────────────────────────────────
const makeColors = (dark) => ({
  background:    dark ? "#0D1117" : "#FFFFFF",
  card:          dark ? "#161B22" : "#F8FAFC",
  surface:       dark ? "#1F2937" : "#FFFFFF",
  surfaceInner:  dark ? "#111827" : "#F3F4F6",
  text:          dark ? "#F9FAFB" : "#111827",
  textSecondary: dark ? "#9CA3AF" : "#6B7280",
  textTertiary:  dark ? "#4B5563" : "#D1D5DB",
  accent:        "#3B82F6",
  accentLight:   "#60A5FA",
  danger:        "#EF4444",
  dangerTint:    dark ? "rgba(239,68,68,0.12)"   : "rgba(239,68,68,0.08)",
  success:       "#10B981",
  successTint:   dark ? "rgba(16,185,129,0.12)"  : "rgba(16,185,129,0.08)",
  warning:       "#F59E0B",
  warningTint:   dark ? "rgba(245,158,11,0.12)"  : "rgba(245,158,11,0.08)",
  border:        dark ? "#374151" : "#E5E7EB",
  overlay:       dark ? "rgba(0,0,0,0.7)" : "rgba(0,0,0,0.45)",
});

// ─── Geo helpers ──────────────────────────────────────────────────────────────
const getDistanceKm = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// ─── Caches & rate limiter ────────────────────────────────────────────────────
const municipalityCache = new Map();
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 1000;

const rateLimitedFetch = async (url, options = {}) => {
  const wait = MIN_REQUEST_INTERVAL - (Date.now() - lastRequestTime);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestTime = Date.now();
  return fetch(url, options);
};

// ─── ETA fetch ────────────────────────────────────────────────────────────────
const OFFLINE_ETA = { eta: "Offline", distance: "—", etaSeconds: Infinity, distanceKm: "—" };

const fetchETA = async (driverCoords, passengerCoords, driverStatus, retries = 2) => {
  if ((driverStatus || "").toLowerCase() === "offline") return OFFLINE_ETA;
  try {
    const { latitude: dLat, longitude: dLon } = driverCoords;
    const { latitude: pLat, longitude: pLon } = passengerCoords;
    const url = `https://router.project-osrm.org/route/v1/driving/${dLon},${dLat};${pLon},${pLat}?overview=false&annotations=duration,distance`;
    const res = await rateLimitedFetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.code !== "Ok" || !data.routes?.[0]) {
      if (retries > 0) {
        await new Promise((r) => setTimeout(r, 1000));
        return fetchETA(driverCoords, passengerCoords, driverStatus, retries - 1);
      }
      throw new Error("No route");
    }
    const route = data.routes[0];
    const etaSeconds = route.duration || 0;
    const etaMinutes = Math.max(1, Math.round(etaSeconds / 60));
    const distanceKm = (route.distance ? route.distance / 1000 : getDistanceKm(dLat, dLon, pLat, pLon)).toFixed(2);
    return { eta: `${etaMinutes} min`, distance: `${distanceKm} km`, etaSeconds, distanceKm };
  } catch {
    if ((driverStatus || "").toLowerCase() === "offline") return OFFLINE_ETA;
    const approxKm = getDistanceKm(driverCoords.latitude, driverCoords.longitude, passengerCoords.latitude, passengerCoords.longitude);
    const approxSec = (approxKm / 40) * 3600;
    return {
      eta: `~${Math.max(1, Math.round(approxSec / 60))} min`,
      distance: `${approxKm.toFixed(2)} km`,
      etaSeconds: approxSec,
      distanceKm: approxKm.toFixed(2),
    };
  }
};

// ─── Municipality fetch ───────────────────────────────────────────────────────
const fetchMunicipality = async ({ latitude, longitude }) => {
  const key = `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
  if (municipalityCache.has(key)) return municipalityCache.get(key);
  try {
    const res = await rateLimitedFetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&accept-language=en`,
      { headers: { "User-Agent": "PassengerApp/1.0", "Accept-Language": "en" } }
    );
    const data = await res.json();
    const muni = data.address
      ? data.address.city || data.address.town || data.address.village || data.address.municipality || ""
      : "";
    municipalityCache.set(key, muni);
    setTimeout(() => municipalityCache.delete(key), 10 * 60 * 1000);
    return muni;
  } catch {
    return "";
  }
};

// ─── Status helpers ───────────────────────────────────────────────────────────
const getStatusDetails = (status, colors) => {
  const s = (status || "").toLowerCase();
  if (s.startsWith("available seats -")) {
    const seats = s.match(/available seats - (\d+)/)?.[1] || "?";
    return { color: colors.success, tint: colors.successTint, text: "Available", seats, icon: "check-circle" };
  }
  if (s.includes("no available seat"))
    return { color: colors.warning, tint: colors.warningTint, text: "Full", seats: "0", icon: "times-circle" };
  if (s === "online")
    return { color: colors.accent, tint: `${colors.accent}18`, text: "Online", seats: null, icon: "circle" };
  return { color: colors.textSecondary, tint: colors.surfaceInner, text: "Offline", seats: null, icon: "power-off" };
};

const getVehicleIcon = (vehicleType) => {
  const t = (vehicleType || "").toLowerCase();
  if (t.includes("bus")) return "bus";
  if (t.includes("van")) return "van-utility";
  return "car";
};

const getDriverStatusColor = (status, colors) => getStatusDetails(status, colors).color;

// ─── Marker callout label ─────────────────────────────────────────────────────
const MarkerCallout = ({ label, color, bgColor }) => (
  <View style={{ alignItems: "center" }}>
    <View style={[mk.dot, { backgroundColor: bgColor }]}>
      <MaterialCommunityIcons name="car" size={18} color={color} />
    </View>
    <View style={[mk.label, { backgroundColor: bgColor }]}>
      <Text style={{ fontSize: 10, color, fontWeight: "700" }}>{label}</Text>
    </View>
  </View>
);

const mk = StyleSheet.create({
  dot: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.2)" },
  label: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginTop: 2 },
});

// ─── DriverCard ───────────────────────────────────────────────────────────────
const DriverCard = React.memo(({ driverId, drivers, etas, municipalities, colors, onPress }) => {
  const driver = drivers[driverId];
  const status = getStatusDetails(driver?.status, colors);
  const eta = etas[driverId] || { eta: "—", distance: "—" };
  const muni = municipalities[driverId] || "";
  const isOffline = (driver?.status || "").toLowerCase() === "offline";

  return (
    <TouchableOpacity
      style={[s.driverCard, { backgroundColor: colors.surface, borderColor: colors.border, opacity: isOffline ? 0.65 : 1 }]}
      onPress={onPress}
      onPressIn={() => haptic()}
      activeOpacity={0.75}
    >
      {/* Header row */}
      <View style={s.dcTop}>
        <View style={[s.vehicleIconWrap, { backgroundColor: status.tint }]}>
          <MaterialCommunityIcons name={getVehicleIcon(driver?.vehicle)} size={22} color={status.color} />
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={[s.driverName, { color: colors.text }]} numberOfLines={1}>
            {driver?.name || "Unknown driver"}
          </Text>
          <View style={[s.statusBadge, { backgroundColor: status.tint }]}>
            <FontAwesome name={status.icon} size={11} color={status.color} />
            <Text style={[s.statusBadgeText, { color: status.color }]}>
              {status.text}
              {status.seats !== null ? ` · ${status.seats} seat${status.seats !== "1" ? "s" : ""}` : ""}
            </Text>
          </View>
        </View>
        <View style={s.etaBlock}>
          <Text style={[s.etaTime, { color: isOffline ? colors.textSecondary : colors.accent }]}>
            {eta.eta}
          </Text>
          <Text style={[s.etaDist, { color: colors.textSecondary }]}>{eta.distance}</Text>
        </View>
      </View>

      <View style={[s.dcDivider, { backgroundColor: colors.border }]} />

      {/* Detail rows */}
      <View style={s.dcDetails}>
        <View style={s.dcDetailRow}>
          <View style={s.dcDetailItem}>
            <Ionicons name="location-outline" size={13} color={colors.textSecondary} />
            <Text style={[s.dcDetailText, { color: colors.textSecondary }]} numberOfLines={1}>
              {muni || "Unknown location"}
            </Text>
          </View>
          <View style={s.dcDetailItem}>
            <FontAwesome5 name="route" size={12} color={colors.textSecondary} />
            <Text style={[s.dcDetailText, { color: colors.textSecondary }]} numberOfLines={1}>
              {driver?.route || "No route"}
            </Text>
          </View>
        </View>
        <View style={s.dcDetailRow}>
          <View style={s.dcDetailItem}>
            <MaterialCommunityIcons name="car-info" size={13} color={colors.textSecondary} />
            <Text style={[s.dcDetailText, { color: colors.textSecondary }]}>
              {driver?.vehicle || "Unknown"}{driver?.vehicleColor ? ` · ${driver.vehicleColor}` : ""}
            </Text>
          </View>
          <View style={s.dcDetailItem}>
            <Ionicons name="card-outline" size={13} color={colors.textSecondary} />
            <Text style={[s.dcDetailText, { color: colors.textSecondary }]}>
              {driver?.plate || "No plate"}
            </Text>
          </View>
        </View>
      </View>

      <View style={[s.dcFooter, { borderTopColor: colors.border }]}>
        <Text style={[s.dcFooterText, { color: colors.textTertiary }]}>
          {isOffline ? "Driver is offline" : "Tap for full details →"}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

// ─── Main Component ───────────────────────────────────────────────────────────
export default function PassengerHomeScreen() {
  const dark = useColorScheme() === "dark";
  const colors = makeColors(dark);
  const navigation = useNavigation();

  const [drivers, setDrivers] = useState({});
  const [municipalities, setMunicipalities] = useState({});
  const [etas, setEtas] = useState({});
  const [etaHistory, setEtaHistory] = useState([]);
  const [region, setRegion] = useState(null);
  const [passengerLocation, setPassengerLocation] = useState(null);
  const [isConnected, setIsConnected] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isFollowingUser, setIsFollowingUser] = useState(true);
  const [mapType, setMapType] = useState("standard");
  const [lastTap, setLastTap] = useState(null);

  // Filter & sort
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortBy, setSortBy] = useState("distance");

  // Modal state
  const [showDrivers, setShowDrivers] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [selectedDriverId, setSelectedDriverId] = useState(null);
  const [driverModalVisible, setDriverModalVisible] = useState(false);

  const driverAnimsRef = useRef({});
  const isMounted = useRef(true);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // ── System UI ──────────────────────────────────────────────────────────────
  const hideSystemUI = useCallback(async () => {
    StatusBar.setHidden(true, "fade");
    try {
      await NavigationBar.setVisibilityAsync("hidden");
      await NavigationBar.setBehaviorAsync("overlay-swipe");
      await NavigationBar.setPositionAsync("absolute");
      await NavigationBar.setBackgroundColorAsync("transparent");
    } catch (_) {}
  }, []);

  useEffect(() => {
    hideSystemUI();
    return () => {
      isMounted.current = false;
      StatusBar.setHidden(false, "slide");
      NavigationBar.setVisibilityAsync("visible").catch(() => {});
    };
  }, []);

  // ── Pulse animation ────────────────────────────────────────────────────────
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.3, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,   duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // ── Network ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      setIsConnected(!!state.isConnected);
      setIsLoading(!state.isConnected);
    });
    return () => unsub();
  }, []);

  // ── Auth guard ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!auth.currentUser) navigation.replace("Login");
  }, [navigation]);

  // ── ETA history ────────────────────────────────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem("etaHistory")
      .then((v) => { if (v) setEtaHistory(JSON.parse(v)); })
      .catch(() => {});
  }, []);

  // ── Passenger location ─────────────────────────────────────────────────────
  useEffect(() => {
    let subscriber = null;
    (async () => {
      await hideSystemUI();
      const { status } = await Location.requestForegroundPermissionsAsync();
      await hideSystemUI();
      if (status !== "granted") {
        Alert.alert("Permission required", "Location access is needed to find nearby drivers.");
        haptic("error");
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.BestForNavigation });
      if (!isMounted.current) return;
      setPassengerLocation(loc.coords);
      setRegion({ latitude: loc.coords.latitude, longitude: loc.coords.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 });

      subscriber = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 2000, distanceInterval: 2 },
        async (update) => {
          if (!isMounted.current) return;
          setPassengerLocation(update.coords);
          if (isFollowingUser) {
            setRegion({ latitude: update.coords.latitude, longitude: update.coords.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 });
          }
          await hideSystemUI();
        }
      );
    })();
    return () => subscriber?.remove();
  }, [isFollowingUser]);

  // ── Firebase drivers ───────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onValue(ref(realtimeDb, "drivers"), (snap) => {
      const data = snap.val() || {};
      const anims = driverAnimsRef.current;

      Object.keys(data).forEach((id) => {
        const loc = data[id]?.location;
        if (!loc) return;
        if (anims[id]) {
          try {
            anims[id].timing({ latitude: loc.latitude, longitude: loc.longitude, duration: 2000, easing: Easing.bezier(0.25, 0.46, 0.45, 0.94), useNativeDriver: false }).start();
          } catch { try { anims[id].setValue({ latitude: loc.latitude, longitude: loc.longitude }); } catch (_) {} }
        } else {
          anims[id] = new AnimatedRegion({ latitude: loc.latitude, longitude: loc.longitude, latitudeDelta: 0.001, longitudeDelta: 0.001 });
        }
      });
      Object.keys(anims).forEach((id) => { if (!data[id]) delete anims[id]; });
      driverAnimsRef.current = anims;
      if (isMounted.current) setDrivers(data);
    });
    return () => unsub();
  }, []);

  // ── Adaptive ETA polling ───────────────────────────────────────────────────
  useEffect(() => {
    let timeout = null;
    let running = true;

    const poll = async () => {
      if (!running || !isMounted.current) return;
      if (!passengerLocation || !isConnected) { timeout = setTimeout(poll, 6000); return; }
      const keys = Object.keys(drivers).filter((k) => drivers[k]?.location);
      if (!keys.length) { timeout = setTimeout(poll, 6000); return; }

      setIsRefreshing(true);
      try {
        const results = await Promise.all(
          keys.map(async (key) => {
            const driver = drivers[key];
            const [etaResult, muni] = await Promise.all([
              fetchETA(driver.location, passengerLocation, driver.status || ""),
              fetchMunicipality(driver.location),
            ]);
            return { key, driver, etaResult, muni };
          })
        );

        const newEtas = { ...etas };
        const newMunis = { ...municipalities };
        const historyEntries = [];
        let nearest = Infinity;
        const ts = new Date().toLocaleTimeString();

        results.forEach(({ key, driver, etaResult, muni }) => {
          newEtas[key] = etaResult;
          newMunis[key] = muni || driver?.municipality || "";
          if ((driver.status || "").toLowerCase() !== "offline") {
            historyEntries.push({ driverId: key, name: driver.name || "Driver", eta: etaResult.eta, distance: etaResult.distance, status: driver.status || "Unknown", route: driver.route || "N/A", time: ts });
          }
          if (etaResult.etaSeconds < nearest) nearest = etaResult.etaSeconds;
        });

        if (isMounted.current) { setEtas(newEtas); setMunicipalities(newMunis); }

        if (historyEntries.length > 0) {
          setEtaHistory((prev) => {
            const merged = [...prev, ...historyEntries].slice(-200);
            AsyncStorage.setItem("etaHistory", JSON.stringify(merged)).catch(() => {});
            return merged;
          });
        }

        let delay = 45000;
        if (nearest <= 20) delay = 3000;
        else if (nearest <= 60) delay = 7000;
        else if (nearest <= 180) delay = 15000;
        else if (nearest === Infinity) delay = 15000;
        delay = Math.max(3000, delay + Math.round(Math.random() * 2000 - 1000));
        timeout = setTimeout(poll, delay);
      } catch {
        timeout = setTimeout(poll, 10000);
      } finally {
        if (isMounted.current) setIsRefreshing(false);
      }
    };

    poll();
    return () => { running = false; if (timeout) clearTimeout(timeout); };
  }, [drivers, passengerLocation, isConnected]);

  // ── Filtered + sorted drivers ──────────────────────────────────────────────
  const filteredDrivers = useMemo(() => {
    return Object.keys(drivers)
      .filter((key) => {
        const driver = drivers[key];
        if (!driver?.location) return false;
        const s = (driver.status || "").toLowerCase();
        if (filterStatus === "available") return s.startsWith("available seats -");
        if (filterStatus === "full") return s.includes("no available seat");
        if (filterStatus === "online") return s === "online";
        if (filterStatus === "offline") return s === "offline";
        return true;
      })
      .sort((a, b) => {
        if (!passengerLocation) return 0;
        if (sortBy === "distance") {
          const da = getDistanceKm(passengerLocation.latitude, passengerLocation.longitude, drivers[a].location.latitude, drivers[a].location.longitude);
          const db = getDistanceKm(passengerLocation.latitude, passengerLocation.longitude, drivers[b].location.latitude, drivers[b].location.longitude);
          return da - db;
        }
        if (sortBy === "eta") {
          const ea = etas[a]?.etaSeconds ?? Infinity;
          const eb = etas[b]?.etaSeconds ?? Infinity;
          return ea - eb;
        }
        if (sortBy === "name") return (drivers[a].name || "").localeCompare(drivers[b].name || "");
        return 0;
      });
  }, [drivers, filterStatus, sortBy, passengerLocation, etas]);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const driverStats = useMemo(() => {
    const all = Object.values(drivers);
    return {
      total:     all.length,
      available: all.filter((d) => (d.status || "").toLowerCase().startsWith("available seats -")).length,
      online:    all.filter((d) => (d.status || "").toLowerCase() === "online").length,
      offline:   all.filter((d) => (d.status || "").toLowerCase() === "offline").length,
    };
  }, [drivers]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleLogout = () => {
    haptic("heavy");
    signOut(auth)
      .then(() => { haptic("success"); navigation.replace("Login"); })
      .catch((e) => { haptic("error"); Alert.alert("Error", e.message); });
  };

  const onRefresh = useCallback(async () => {
    haptic();
    if (!passengerLocation) return;
    setIsRefreshing(true);
    try {
      const results = await Promise.all(
        Object.keys(drivers)
          .filter((k) => drivers[k]?.location)
          .map(async (key) => {
            const [etaResult, muni] = await Promise.all([
              fetchETA(drivers[key].location, passengerLocation, drivers[key].status || ""),
              fetchMunicipality(drivers[key].location),
            ]);
            return { key, etaResult, muni };
          })
      );
      const newEtas = { ...etas };
      const newMunis = { ...municipalities };
      results.forEach(({ key, etaResult, muni }) => {
        newEtas[key] = etaResult;
        newMunis[key] = muni || municipalities[key] || "";
      });
      setEtas(newEtas);
      setMunicipalities(newMunis);
      haptic("success");
    } catch { haptic("error"); }
    finally { setIsRefreshing(false); }
  }, [drivers, passengerLocation, etas, municipalities]);

  const clearHistory = () => {
    haptic("heavy");
    Alert.alert("Clear ETA history", "Are you sure you want to delete all history?", [
      { text: "Cancel", style: "cancel" },
      { text: "Clear", style: "destructive", onPress: async () => {
        await AsyncStorage.removeItem("etaHistory").catch(() => {});
        setEtaHistory([]);
        haptic("success");
      }},
    ]);
  };

  const centerOnUser = () => {
    haptic();
    if (passengerLocation) {
      setRegion({ ...passengerLocation, latitudeDelta: 0.01, longitudeDelta: 0.01 });
      setIsFollowingUser(true);
    }
  };

  const handleMapDoubleTap = () => {
    const now = Date.now();
    if (lastTap && now - lastTap < 300) {
      haptic();
      setRegion((p) => ({ ...p, latitudeDelta: p.latitudeDelta / 2, longitudeDelta: p.longitudeDelta / 2 }));
    }
    setLastTap(now);
  };

  const handleRegionChangeComplete = (newRegion) => {
    if (isFollowingUser && passengerLocation) {
      const dist = getDistanceKm(newRegion.latitude, newRegion.longitude, passengerLocation.latitude, passengerLocation.longitude);
      if (dist > 0.1) { setIsFollowingUser(false); haptic(); }
    }
  };

  const openDriverDetail = (id) => { haptic("medium"); setSelectedDriverId(id); setDriverModalVisible(true); };

  const AnimatedMarker = Marker.Animated || Marker;
  const selectedDriver = selectedDriverId ? drivers[selectedDriverId] : null;
  const selectedEta = selectedDriverId ? (etas[selectedDriverId] || { eta: "—", distance: "—" }) : { eta: "—", distance: "—" };
  const selectedMuni = selectedDriverId ? (municipalities[selectedDriverId] || "") : "";
  const email = auth.currentUser?.email || "";
  const initials = email.charAt(0).toUpperCase() || "U";

  // ── Offline screen ─────────────────────────────────────────────────────────
  if (!isConnected) {
    return (
      <View style={[s.root, { backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }]}>
        <Ionicons name="cloud-offline-outline" size={56} color={colors.textSecondary} />
        <Text style={[s.offlineTitle, { color: colors.text }]}>No internet connection</Text>
        <Text style={[s.offlineSub, { color: colors.textSecondary }]}>Reconnect to see nearby drivers</Text>
      </View>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      {/* ── Map ── */}
      {region ? (
        <View style={{ flex: 1 }}>
          <MapView
            style={s.map}
            provider={PROVIDER_GOOGLE}
            region={region}
            mapType={mapType}
            showsCompass={false}
            showsUserLocation={false}
            onRegionChangeComplete={handleRegionChangeComplete}
            onPress={handleMapDoubleTap}
          >
            {/* Passenger marker */}
            {passengerLocation && (
              <Marker coordinate={passengerLocation}>
                <Animated.View style={[s.passengerMarker, { transform: [{ scale: pulseAnim }] }]}>
                  <MaterialCommunityIcons name="account-circle" size={24} color={colors.accent} />
                </Animated.View>
              </Marker>
            )}

            {/* Driver markers */}
            {Object.keys(drivers).map((key) => {
              const driver = drivers[key];
              if (!driver?.location) return null;
              const anims = driverAnimsRef.current;
              const coordinate = anims[key] || { latitude: driver.location.latitude, longitude: driver.location.longitude };
              const dStatus = getStatusDetails(driver.status, colors);
              const etaData = etas[key];
              const label = etaData?.eta && etaData.eta !== "Offline" ? etaData.eta : dStatus.text;

              return (
                <AnimatedMarker key={key} coordinate={coordinate} onPress={() => { haptic("medium"); openDriverDetail(key); }}>
                  <MarkerCallout label={label} color={dStatus.color} bgColor={dStatus.tint} />
                </AnimatedMarker>
              );
            })}
          </MapView>

          {/* Profile button */}
          <TouchableOpacity
            style={[s.profileBtn, { backgroundColor: colors.accent }]}
            onPress={() => { haptic(); setShowMenu(true); }}
          >
            <Text style={s.profileBtnText}>{initials}</Text>
          </TouchableOpacity>

          {/* Connection pill */}
          <View style={[s.connPill, { backgroundColor: `${colors.success}18`, borderColor: `${colors.success}40` }]}>
            <View style={[s.connDot, { backgroundColor: colors.success }]} />
            <Text style={{ fontSize: 11, color: colors.success, fontWeight: "600" }}>Online</Text>
          </View>

          {/* Map controls */}
          <View style={s.mapControls}>
            <TouchableOpacity style={[s.ctrlBtn, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={centerOnUser} onPressIn={() => haptic()}>
              <Ionicons name="locate" size={20} color={isFollowingUser ? colors.accent : colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity style={[s.ctrlBtn, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => { haptic(); setMapType((p) => p === "standard" ? "satellite" : "standard"); }} onPressIn={() => haptic()}>
              <Ionicons name={mapType === "standard" ? "map-outline" : "radio-outline"} size={20} color={colors.text} />
            </TouchableOpacity>
            <View style={[s.zoomStack, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <TouchableOpacity style={s.zoomBtn} onPress={() => { haptic(); setRegion((p) => ({ ...p, latitudeDelta: p.latitudeDelta / 2, longitudeDelta: p.longitudeDelta / 2 })); }}>
                <Ionicons name="add" size={20} color={colors.text} />
              </TouchableOpacity>
              <View style={[s.zoomDiv, { backgroundColor: colors.border }]} />
              <TouchableOpacity style={s.zoomBtn} onPress={() => { haptic(); setRegion((p) => ({ ...p, latitudeDelta: p.latitudeDelta * 2, longitudeDelta: p.longitudeDelta * 2 })); }}>
                <Ionicons name="remove" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Refresh FAB */}
          <TouchableOpacity style={[s.refreshFab, { backgroundColor: colors.accent }]} onPress={onRefresh} onPressIn={() => haptic()}>
            <Ionicons name="refresh-outline" size={22} color="#FFF" />
          </TouchableOpacity>

          {/* Drivers FAB */}
          <TouchableOpacity
            style={[s.driversFab, { backgroundColor: colors.accent }]}
            onPress={() => { haptic("medium"); setShowDrivers(true); }}
            activeOpacity={0.85}
            onPressIn={() => haptic()}
          >
            <MaterialCommunityIcons name="car-multiple" size={22} color="#FFF" />
            <Text style={s.fabText}>
              {filteredDrivers.length} Driver{filteredDrivers.length !== 1 ? "s" : ""} nearby
              {isRefreshing ? "  ·  Updating…" : ""}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={s.mapLoading}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={[s.mapLoadingText, { color: colors.text }]}>Locating you…</Text>
        </View>
      )}

      {/* ── Nearby drivers modal ── */}
      <Modal
        isVisible={showDrivers}
        animationIn="slideInUp"
        animationOut="slideOutDown"
        onBackdropPress={() => { haptic(); setShowDrivers(false); }}
        backdropColor={colors.overlay}
        backdropOpacity={1}
        useNativeDriver
        style={s.modal}
      >
        <View style={[s.modalSheet, { backgroundColor: colors.background }]}>
          {/* Handle */}
          <View style={[s.handle, { backgroundColor: colors.border }]} />

          {/* Header */}
          <View style={s.sheetHeader}>
            <TouchableOpacity onPress={() => { haptic(); setShowDrivers(false); }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="chevron-down" size={26} color={colors.textSecondary} />
            </TouchableOpacity>
            <Text style={[s.sheetTitle, { color: colors.text }]}>
              Nearby drivers ({filteredDrivers.length})
            </Text>
            <TouchableOpacity onPress={() => { haptic(); setShowFilters(true); }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="filter-outline" size={22} color={colors.accent} />
            </TouchableOpacity>
          </View>

          {/* Stats row */}
          <View style={[s.statsRow, { backgroundColor: colors.card }]}>
            {[
              { val: driverStats.total,     label: "Total",     color: colors.text },
              { val: driverStats.available, label: "Available", color: colors.success },
              { val: driverStats.online,    label: "Online",    color: colors.accent },
              { val: driverStats.offline,   label: "Offline",   color: colors.textSecondary },
            ].map((stat, i, arr) => (
              <React.Fragment key={stat.label}>
                <View style={s.statItem}>
                  <Text style={[s.statVal, { color: stat.color }]}>{stat.val}</Text>
                  <Text style={[s.statLabel, { color: colors.textSecondary }]}>{stat.label}</Text>
                </View>
                {i < arr.length - 1 && <View style={[s.statDiv, { backgroundColor: colors.border }]} />}
              </React.Fragment>
            ))}
          </View>

          {/* Active filter chip */}
          <View style={[s.filterChip, { backgroundColor: colors.card }]}>
            <Ionicons name="filter-outline" size={12} color={colors.textSecondary} />
            <Text style={[s.filterChipText, { color: colors.textSecondary }]}>
              {filterStatus} · sort: {sortBy}
            </Text>
          </View>

          {/* List */}
          <FlatList
            data={filteredDrivers}
            keyExtractor={(item) => item}
            renderItem={({ item }) => (
              <DriverCard
                driverId={item}
                drivers={drivers}
                etas={etas}
                municipalities={municipalities}
                colors={colors}
                onPress={() => { setShowDrivers(false); setTimeout(() => openDriverDetail(item), 300); }}
              />
            )}
            contentContainerStyle={s.listContent}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={[s.emptyState, { backgroundColor: colors.card }]}>
                <MaterialCommunityIcons name="car-off" size={52} color={colors.textSecondary} />
                <Text style={[s.emptyTitle, { color: colors.text }]}>No drivers found</Text>
                <Text style={[s.emptySub, { color: colors.textSecondary }]}>
                  {filterStatus === "all" ? "No active drivers in your area." : `No drivers match "${filterStatus}".`}
                </Text>
              </View>
            }
          />

          {/* Action bar */}
          <View style={[s.actionBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
            <TouchableOpacity
              style={[s.actionBtn, { backgroundColor: colors.card }]}
              onPress={() => { haptic(); setShowDrivers(false); setTimeout(() => setShowHistory(true), 300); }}
              onPressIn={() => haptic()}
            >
              <Ionicons name="time-outline" size={18} color={colors.textSecondary} />
              <Text style={[s.actionBtnText, { color: colors.textSecondary }]}>History</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.actionBtn, { backgroundColor: colors.card }]}
              onPress={onRefresh}
              onPressIn={() => haptic()}
            >
              <Ionicons name="refresh-outline" size={18} color={colors.textSecondary} />
              <Text style={[s.actionBtnText, { color: colors.textSecondary }]}>Refresh</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Filter modal ── */}
      <Modal
        isVisible={showFilters}
        animationIn="slideInUp"
        animationOut="slideOutDown"
        onBackdropPress={() => { haptic(); setShowFilters(false); }}
        backdropColor={colors.overlay}
        backdropOpacity={1}
        useNativeDriver
        style={s.modal}
      >
        <View style={[s.filterSheet, { backgroundColor: colors.background }]}>
          <View style={[s.filterHeader, { borderBottomColor: colors.border }]}>
            <Text style={[s.sheetTitle, { color: colors.text }]}>Filter & sort</Text>
            <TouchableOpacity onPress={() => { haptic(); setShowFilters(false); }}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ padding: 16 }}>
            <Text style={[s.filterSectionTitle, { color: colors.text }]}>Driver status</Text>
            <View style={s.filterChips}>
              {[
                { key: "all",      label: "All",       icon: "globe-outline" },
                { key: "available",label: "Available", icon: "checkmark-circle-outline" },
                { key: "full",     label: "Full",      icon: "close-circle-outline" },
                { key: "online",   label: "Online",    icon: "wifi-outline" },
                { key: "offline",  label: "Offline",   icon: "cloud-offline-outline" },
              ].map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  style={[s.filterChipBtn, {
                    backgroundColor: filterStatus === opt.key ? colors.accent : colors.card,
                    borderColor: filterStatus === opt.key ? colors.accent : colors.border,
                  }]}
                  onPress={() => { haptic(); setFilterStatus(opt.key); }}
                >
                  <Ionicons name={opt.icon} size={14} color={filterStatus === opt.key ? "#FFF" : colors.textSecondary} />
                  <Text style={{ fontSize: 13, fontWeight: "500", marginLeft: 5, color: filterStatus === opt.key ? "#FFF" : colors.text }}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[s.filterSectionTitle, { color: colors.text, marginTop: 20 }]}>Sort by</Text>
            <View style={s.filterChips}>
              {[
                { key: "distance", label: "Distance", icon: "locate-outline" },
                { key: "eta",      label: "ETA",      icon: "time-outline" },
                { key: "name",     label: "Name",     icon: "person-outline" },
              ].map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  style={[s.filterChipBtn, {
                    backgroundColor: sortBy === opt.key ? colors.accent : colors.card,
                    borderColor: sortBy === opt.key ? colors.accent : colors.border,
                  }]}
                  onPress={() => { haptic(); setSortBy(opt.key); }}
                >
                  <Ionicons name={opt.icon} size={14} color={sortBy === opt.key ? "#FFF" : colors.textSecondary} />
                  <Text style={{ fontSize: 13, fontWeight: "500", marginLeft: 5, color: sortBy === opt.key ? "#FFF" : colors.text }}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <View style={[s.filterFooter, { borderTopColor: colors.border }]}>
            <TouchableOpacity
              style={[s.resetBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => { haptic(); setFilterStatus("all"); setSortBy("distance"); }}
            >
              <Text style={{ color: colors.textSecondary, fontSize: 15, fontWeight: "500" }}>Reset</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.applyBtn, { backgroundColor: colors.accent }]}
              onPress={() => { haptic("medium"); setShowFilters(false); }}
            >
              <Text style={{ color: "#FFF", fontSize: 15, fontWeight: "600" }}>Apply</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── ETA history modal ── */}
      <Modal
        isVisible={showHistory}
        animationIn="slideInUp"
        animationOut="slideOutDown"
        onBackdropPress={() => { haptic(); setShowHistory(false); }}
        backdropColor={colors.overlay}
        backdropOpacity={1}
        useNativeDriver
        style={s.modal}
      >
        <View style={[s.modalSheet, { backgroundColor: colors.background }]}>
          <View style={[s.handle, { backgroundColor: colors.border }]} />
          <View style={s.sheetHeader}>
            <TouchableOpacity onPress={() => { haptic(); setShowHistory(false); }}>
              <Ionicons name="chevron-down" size={26} color={colors.textSecondary} />
            </TouchableOpacity>
            <Text style={[s.sheetTitle, { color: colors.text }]}>ETA history</Text>
            <TouchableOpacity
              style={[s.clearBtn, { backgroundColor: colors.dangerTint }]}
              onPress={clearHistory}
            >
              <Text style={{ fontSize: 12, fontWeight: "600", color: colors.danger }}>Clear all</Text>
            </TouchableOpacity>
          </View>
          <Text style={[s.historyCount, { color: colors.textSecondary }]}>
            {etaHistory.length} record{etaHistory.length !== 1 ? "s" : ""}
          </Text>
          <FlatList
            data={[...etaHistory].reverse()}
            keyExtractor={(_, i) => i.toString()}
            renderItem={({ item }) => (
              <View style={[s.historyItem, { backgroundColor: colors.surface, borderLeftColor: getDriverStatusColor(item.status, colors) }]}>
                <View style={s.historyTop}>
                  <Text style={[s.historyName, { color: colors.text }]}>{item.name}</Text>
                  <Text style={[s.historyTime, { color: colors.textSecondary }]}>{item.time}</Text>
                </View>
                <View style={s.historyMeta}>
                  <View style={s.historyMetaItem}><Ionicons name="time-outline" size={13} color={colors.textSecondary} /><Text style={[s.historyMetaText, { color: colors.text }]}>{item.eta}</Text></View>
                  <View style={s.historyMetaItem}><Ionicons name="locate-outline" size={13} color={colors.textSecondary} /><Text style={[s.historyMetaText, { color: colors.text }]}>{item.distance || "—"}</Text></View>
                </View>
                <Text style={[s.historyRoute, { color: colors.textSecondary }]}>{item.route} · {item.status}</Text>
              </View>
            )}
            contentContainerStyle={s.listContent}
            ListEmptyComponent={
              <View style={[s.emptyState, { backgroundColor: colors.card }]}>
                <Ionicons name="time-outline" size={52} color={colors.textSecondary} />
                <Text style={[s.emptyTitle, { color: colors.text }]}>No history yet</Text>
                <Text style={[s.emptySub, { color: colors.textSecondary }]}>Your ETA history will appear here.</Text>
              </View>
            }
          />
        </View>
      </Modal>

      {/* ── Driver detail modal ── */}
      <Modal
        isVisible={driverModalVisible}
        animationIn="slideInUp"
        animationOut="slideOutDown"
        onBackdropPress={() => { haptic(); setDriverModalVisible(false); }}
        backdropColor={colors.overlay}
        backdropOpacity={1}
        useNativeDriver
        style={s.modal}
      >
        <View style={[s.detailSheet, { backgroundColor: colors.background }]}>
          {selectedDriver && (
            <>
              <View style={[s.detailHeader, { borderBottomColor: colors.border }]}>
                <View style={[s.detailAvatar, { backgroundColor: getStatusDetails(selectedDriver.status, colors).tint }]}>
                  <MaterialCommunityIcons name={getVehicleIcon(selectedDriver.vehicle)} size={26} color={getStatusDetails(selectedDriver.status, colors).color} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[s.detailName, { color: colors.text }]} numberOfLines={1}>
                    {selectedDriver.name || "Unknown driver"}
                  </Text>
                  <View style={[s.statusBadge, { backgroundColor: getStatusDetails(selectedDriver.status, colors).tint, alignSelf: "flex-start" }]}>
                    <Text style={[s.statusBadgeText, { color: getStatusDetails(selectedDriver.status, colors).color }]}>
                      {getStatusDetails(selectedDriver.status, colors).text}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity onPress={() => { haptic(); setDriverModalVisible(false); }}>
                  <Ionicons name="close" size={22} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <ScrollView style={{ padding: 16 }} showsVerticalScrollIndicator={false}>
                {/* ETA card */}
                <View style={[s.detailSection, { backgroundColor: colors.card }]}>
                  <Text style={[s.detailSectionTitle, { color: colors.text }]}>Estimated arrival</Text>
                  <View style={s.etaRow}>
                    <View style={s.etaCell}>
                      <Text style={[s.etaBig, { color: (selectedDriver.status || "").toLowerCase() === "offline" ? colors.textSecondary : colors.accent }]}>
                        {selectedEta.eta}
                      </Text>
                      <Text style={[s.etaSmall, { color: colors.textSecondary }]}>Time</Text>
                    </View>
                    <View style={[s.etaDivider, { backgroundColor: colors.border }]} />
                    <View style={s.etaCell}>
                      <Text style={[s.etaBig, { color: colors.text }]}>{selectedEta.distance}</Text>
                      <Text style={[s.etaSmall, { color: colors.textSecondary }]}>Distance</Text>
                    </View>
                  </View>
                </View>

                {/* Info card */}
                <View style={[s.detailSection, { backgroundColor: colors.card }]}>
                  <Text style={[s.detailSectionTitle, { color: colors.text }]}>Driver information</Text>
                  {[
                    { icon: "car-outline",          label: "Vehicle",        value: selectedDriver.vehicle },
                    { icon: "document-text-outline", label: "Plate",          value: selectedDriver.plate },
                    { icon: "color-fill-outline",    label: "Color",          value: selectedDriver.vehicleColor },
                    { icon: "location-outline",      label: "Municipality",   value: selectedMuni },
                    { icon: "map-outline",           label: "Route",          value: selectedDriver.route },
                    { icon: "call-outline",          label: "Phone",          value: selectedDriver.phoneNumber },
                    ...(selectedDriver.reason ? [{ icon: "alert-circle-outline", label: "Reason", value: selectedDriver.reason }] : []),
                    ...(selectedDriver.issueType ? [{ icon: "warning-outline", label: "Issue type", value: selectedDriver.issueType }] : []),
                    ...(selectedDriver.vehicleStatus ? [{ icon: "construct-outline", label: "Vehicle status", value: selectedDriver.vehicleStatus }] : []),
                  ].map((row, i) => (
                    <View key={i} style={[s.detailRow, { borderBottomColor: colors.border }]}>
                      <View style={s.detailRowLeft}>
                        <Ionicons name={row.icon} size={15} color={colors.textSecondary} />
                        <Text style={[s.detailLabel, { color: colors.textSecondary }]}>{row.label}</Text>
                      </View>
                      <Text style={[s.detailValue, { color: colors.text }]} numberOfLines={2}>
                        {row.value || "—"}
                      </Text>
                    </View>
                  ))}
                </View>

                {/* Coordinates */}
                {selectedDriver?.location && (
                  <View style={[s.detailSection, { backgroundColor: colors.card }]}>
                    <Text style={[s.detailSectionTitle, { color: colors.text }]}>Location</Text>
                    <Text style={[s.coordText, { color: colors.textSecondary, backgroundColor: colors.surfaceInner }]}>
                      {selectedDriver.location.latitude?.toFixed(6)}, {selectedDriver.location.longitude?.toFixed(6)}
                    </Text>
                  </View>
                )}
              </ScrollView>
            </>
          )}
        </View>
      </Modal>

      {/* ── Profile menu modal ── */}
      <Modal
        isVisible={showMenu}
        animationIn="fadeIn"
        animationOut="fadeOut"
        onBackdropPress={() => { haptic(); setShowMenu(false); }}
        backdropColor={colors.overlay}
        backdropOpacity={1}
        useNativeDriver
        style={{ margin: 0, justifyContent: "flex-start", alignItems: "flex-start", paddingTop: Platform.OS === "ios" ? 50 : 24, paddingLeft: 16 }}
      >
        <View style={[s.menuSheet, { backgroundColor: colors.surface }]}>
          <View style={s.menuProfile}>
            <View style={[s.menuAvatar, { backgroundColor: colors.accent }]}>
              <Text style={s.menuAvatarText}>{initials}</Text>
            </View>
            <Text style={[s.menuEmail, { color: colors.text }]} numberOfLines={1}>{email}</Text>
          </View>
          <View style={[s.menuDivider, { backgroundColor: colors.border }]} />
          <TouchableOpacity style={s.menuRow} onPress={handleLogout} onPressIn={() => haptic()}>
            <Ionicons name="log-out-outline" size={19} color={colors.danger} />
            <Text style={[s.menuRowText, { color: colors.danger }]}>Log out</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.menuRow} onPress={() => { haptic(); setShowMenu(false); }} onPressIn={() => haptic()}>
            <Ionicons name="close-outline" size={19} color={colors.textSecondary} />
            <Text style={[s.menuRowText, { color: colors.textSecondary }]}>Close</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1 },
  map: { flex: 1 },
  mapLoading: { flex: 1, alignItems: "center", justifyContent: "center" },
  mapLoadingText: { fontSize: 15, fontWeight: "500", marginTop: 12 },

  offlineTitle: { fontSize: 20, fontWeight: "700", marginTop: 16, marginBottom: 6 },
  offlineSub: { fontSize: 14 },

  // Map UI
  passengerMarker: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(59,130,246,0.18)", borderWidth: 1.5, borderColor: "rgba(59,130,246,0.4)" },
  profileBtn: { position: "absolute", top: Platform.OS === "ios" ? 50 : 20, left: 16, width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  profileBtnText: { color: "#FFF", fontWeight: "700", fontSize: 17 },
  connPill: { position: "absolute", top: Platform.OS === "ios" ? 100 : 70, left: 16, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, borderWidth: 1 },
  connDot: { width: 6, height: 6, borderRadius: 3 },
  mapControls: { position: "absolute", top: Platform.OS === "ios" ? 50 : 20, right: 16, alignItems: "center", gap: 10 },
  ctrlBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  zoomStack: { borderRadius: 22, borderWidth: 1, overflow: "hidden" },
  zoomBtn: { width: 44, height: 36, alignItems: "center", justifyContent: "center" },
  zoomDiv: { height: 1 },
  refreshFab: { position: "absolute", bottom: 92, right: 16, width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  driversFab: { position: "absolute", bottom: 20, left: 16, right: 16, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  fabText: { color: "#FFF", fontSize: 15, fontWeight: "600" },

  // Modals
  modal: { margin: 0, justifyContent: "flex-end" },
  modalSheet: { maxHeight: height * 0.88, borderTopLeftRadius: 22, borderTopRightRadius: 22, overflow: "hidden" },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginTop: 10, marginBottom: 4 },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingVertical: 12 },
  sheetTitle: { fontSize: 17, fontWeight: "700" },

  // Stats
  statsRow: { flexDirection: "row", alignItems: "center", marginHorizontal: 16, marginBottom: 8, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 8 },
  statItem: { flex: 1, alignItems: "center" },
  statVal: { fontSize: 18, fontWeight: "700" },
  statLabel: { fontSize: 11, fontWeight: "500", marginTop: 2 },
  statDiv: { width: 1, height: 22 },

  // Filter chip inline
  filterChip: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 5, borderRadius: 10, marginLeft: 16, marginBottom: 8 },
  filterChipText: { fontSize: 12, fontWeight: "500" },

  // List
  listContent: { paddingHorizontal: 16, paddingBottom: 90, paddingTop: 4 },

  // Driver card
  driverCard: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 8 },
  dcTop: { flexDirection: "row", alignItems: "flex-start", marginBottom: 10 },
  vehicleIconWrap: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", marginRight: 10, flexShrink: 0 },
  driverName: { fontSize: 15, fontWeight: "600", marginBottom: 4 },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, alignSelf: "flex-start" },
  statusBadgeText: { fontSize: 11, fontWeight: "600" },
  etaBlock: { alignItems: "flex-end" },
  etaTime: { fontSize: 19, fontWeight: "700" },
  etaDist: { fontSize: 11, fontWeight: "500", marginTop: 1 },
  dcDivider: { height: 1, marginVertical: 8 },
  dcDetails: { gap: 6 },
  dcDetailRow: { flexDirection: "row" },
  dcDetailItem: { flexDirection: "row", alignItems: "center", gap: 5, flex: 1 },
  dcDetailText: { fontSize: 11, flex: 1 },
  dcFooter: { borderTopWidth: 1, paddingTop: 8, alignItems: "flex-end", marginTop: 6 },
  dcFooterText: { fontSize: 11, fontWeight: "500" },

  // Action bar
  actionBar: { flexDirection: "row", gap: 10, padding: 12, borderTopWidth: 1, position: "absolute", bottom: 0, left: 0, right: 0 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10 },
  actionBtnText: { fontSize: 13, fontWeight: "500" },

  // Empty state
  emptyState: { alignItems: "center", padding: 40, borderRadius: 14, marginTop: 24 },
  emptyTitle: { fontSize: 17, fontWeight: "600", marginTop: 14, marginBottom: 6 },
  emptySub: { fontSize: 13, textAlign: "center", lineHeight: 19 },

  // Filter sheet
  filterSheet: { maxHeight: height * 0.75, borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  filterHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1 },
  filterSectionTitle: { fontSize: 15, fontWeight: "700", marginBottom: 12 },
  filterChips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  filterChipBtn: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, borderWidth: 1 },
  filterFooter: { flexDirection: "row", gap: 10, padding: 16, borderTopWidth: 1 },
  resetBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 1, alignItems: "center" },
  applyBtn: { flex: 2, paddingVertical: 13, borderRadius: 12, alignItems: "center" },

  // History
  clearBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8 },
  historyCount: { fontSize: 12, paddingHorizontal: 18, marginBottom: 8 },
  historyItem: { backgroundColor: "transparent", borderRadius: 10, padding: 12, marginBottom: 8, borderLeftWidth: 3 },
  historyTop: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  historyName: { fontSize: 14, fontWeight: "600", flex: 1 },
  historyTime: { fontSize: 11 },
  historyMeta: { flexDirection: "row", gap: 16, marginBottom: 5 },
  historyMetaItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  historyMetaText: { fontSize: 13, fontWeight: "500" },
  historyRoute: { fontSize: 11 },

  // Driver detail
  detailSheet: { maxHeight: height * 0.85, borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  detailHeader: { flexDirection: "row", alignItems: "center", padding: 16, borderBottomWidth: 1 },
  detailAvatar: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  detailName: { fontSize: 17, fontWeight: "700", marginBottom: 4 },
  detailSection: { borderRadius: 14, padding: 14, marginBottom: 14 },
  detailSectionTitle: { fontSize: 14, fontWeight: "700", marginBottom: 12 },
  etaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-around" },
  etaCell: { flex: 1, alignItems: "center" },
  etaBig: { fontSize: 26, fontWeight: "700", marginBottom: 3 },
  etaSmall: { fontSize: 12, fontWeight: "500" },
  etaDivider: { width: 1, height: 36 },
  detailRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10, borderBottomWidth: 1 },
  detailRowLeft: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  detailLabel: { fontSize: 13, fontWeight: "500" },
  detailValue: { fontSize: 13, flex: 1, textAlign: "right", marginLeft: 8 },
  coordText: { fontSize: 12, textAlign: "center", padding: 10, borderRadius: 8, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },

  // Menu
  menuSheet: { width: 260, borderRadius: 16, overflow: "hidden" },
  menuProfile: { padding: 18, alignItems: "center" },
  menuAvatar: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  menuAvatarText: { color: "#FFF", fontSize: 22, fontWeight: "700" },
  menuEmail: { fontSize: 13, fontWeight: "500", textAlign: "center" },
  menuDivider: { height: 1, marginHorizontal: 0 },
  menuRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
  menuRowText: { fontSize: 15, fontWeight: "500" },
});