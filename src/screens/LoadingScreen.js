import React, { useEffect, useState, useRef } from "react";
import {
  View,
  ActivityIndicator,
  StyleSheet,
  Text,
  Image,
  useColorScheme,
  Alert,
  Animated,
  Dimensions,
  StatusBar,
  Platform,
  Easing,
} from "react-native";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase";
import NetInfo from "@react-native-community/netinfo";
import { SafeAreaView, SafeAreaProvider } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import * as Device from "expo-device";
import * as NavigationBar from "expo-navigation-bar";

const { width, height } = Dimensions.get("window");

const lightTheme = {
  background: "#FFFFFF",
  primary: "#007AFF",
  secondary: "#5856D6",
  text: "#1A1A1A",
  textSecondary: "#666666",
  textTertiary: "#8E8E93",
  logoBg: "#F2F2F7",
  logoBorder: "#E5E5EA",
  progressBg: "#E5E5EA",
  featureIconBg: "#F2F2F7",
  tipBg: "rgba(0, 122, 255, 0.05)",
  tipBorder: "rgba(0, 122, 255, 0.12)",
  tipLabel: "#5856D6",
  tipText: "#1A1A1A",
  pingColor: "rgba(0, 122, 255, 0.18)",
  pillBg: "#F2F2F7",
  pillBorder: "#E5E5EA",
};

const darkTheme = {
  background: "#000000",
  primary: "#0A84FF",
  secondary: "#5E5CE6",
  text: "#FFFFFF",
  textSecondary: "#8E8E93",
  textTertiary: "#636366",
  logoBg: "#1C1C1E",
  logoBorder: "#2C2C2E",
  progressBg: "#2C2C2E",
  featureIconBg: "#2C2C2E",
  tipBg: "rgba(10, 132, 255, 0.08)",
  tipBorder: "rgba(10, 132, 255, 0.18)",
  tipLabel: "#5E5CE6",
  tipText: "#8E8E93",
  pingColor: "rgba(10, 132, 255, 0.2)",
  pillBg: "#1C1C1E",
  pillBorder: "#2C2C2E",
};

const LOADING_PHASES = [
  { threshold: 0,  label: "Initializing app…" },
  { threshold: 30, label: "Checking connection…" },
  { threshold: 60, label: "Verifying credentials…" },
  { threshold: 90, label: "Ready to launch!" },
];

function getPhaseLabel(progress) {
  let label = LOADING_PHASES[0].label;
  for (const phase of LOADING_PHASES) {
    if (progress >= phase.threshold) label = phase.label;
  }
  return label;
}

export default function LoadingScreen({ navigation }) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const theme = isDark ? darkTheme : lightTheme;

  const [isConnected, setIsConnected] = useState(true);
  const [progress, setProgress] = useState(0);
  const [isTablet, setIsTablet] = useState(false);
  const [isCheckingDevice, setIsCheckingDevice] = useState(true);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.92)).current;
  const slideAnim = useRef(new Animated.Value(32)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  // GPS ping animations — 3 rings staggered
  const pingAnims = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;

  // ─── Hide system bars ───────────────────────────────────────────────────────
  useEffect(() => {
    StatusBar.setHidden(true, "slide");
    NavigationBar.setVisibilityAsync("hidden");
    NavigationBar.setBehaviorAsync("overlay-swipe");
    return () => {
      StatusBar.setHidden(false, "slide");
      NavigationBar.setVisibilityAsync("visible");
    };
  }, []);

  // ─── Device type check ──────────────────────────────────────────────────────
  useEffect(() => {
    const checkDevice = async () => {
      try {
        let detected = false;

        if (Device.isDevice) {
          const deviceType = await Device.getDeviceTypeAsync();
          if (
            deviceType === Device.DeviceType.TABLET ||
            deviceType === Device.DeviceType.DESKTOP
          ) {
            detected = true;
          }
        }

        const aspectRatio = height / width;
        if (
          !detected &&
          ((Platform.OS === "ios" && (Platform.isPad || width >= 768)) ||
            (Platform.OS === "android" && width >= 600) ||
            (width > 500 && aspectRatio < 1.6))
        ) {
          detected = true;
        }

        if (!detected && Platform.OS === "ios") {
          const model = Device.modelName || "";
          if (model.toLowerCase().includes("ipad")) detected = true;
        }

        if (detected) {
          setIsTablet(true);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
      } catch {
        const isTabletBySize =
          width >= 600 || (width > 500 && height / width < 1.6);
        if (isTabletBySize) setIsTablet(true);
      } finally {
        setIsCheckingDevice(false);
      }
    };
    checkDevice();
  }, []);

  // ─── Progress ticker ────────────────────────────────────────────────────────
  useEffect(() => {
    if (isTablet) return;
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        return prev + 1;
      });
    }, 50);
    return () => clearInterval(interval);
  }, [isTablet]);

  // ─── Animate progress bar ───────────────────────────────────────────────────
  useEffect(() => {
    if (isTablet) return;
    Animated.timing(progressAnim, {
      toValue: progress / 100,
      duration: 80,
      useNativeDriver: false,
    }).start();
  }, [progress, isTablet]);

  // ─── Shimmer loop ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (isTablet) return;
    Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: 1400,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, [isTablet]);

  // ─── Entrance animations ────────────────────────────────────────────────────
  useEffect(() => {
    if (isTablet) return;
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 700,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 120,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [isTablet]);

  // ─── GPS ping animations ─────────────────────────────────────────────────────
  useEffect(() => {
    if (isTablet) return;
    const createPing = (anim, delay) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, {
            toValue: 1,
            duration: 2200,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ])
      );

    const anims = pingAnims.map((anim, i) => createPing(anim, i * 700));
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
  }, [isTablet]);

  // ─── Auth + NetInfo ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (isTablet) return;

    const unsubscribeNetInfo = NetInfo.addEventListener((state) => {
      setIsConnected((prev) => {
        if (!state.isConnected && prev) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          Alert.alert(
            "Connection Lost",
            "Please check your internet connection. App functionality may be limited.",
            [{ text: "OK" }]
          );
        } else if (state.isConnected && !prev) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        return state.isConnected;
      });
    });

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      const delay = isConnected ? 2000 : 1500;
      setTimeout(() => {
        if (user) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          navigation.replace("Home");
        } else {
          navigation.replace("Login");
        }
      }, delay);
    });

    return () => {
      unsubscribeAuth();
      unsubscribeNetInfo();
    };
  }, [navigation, isTablet]);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  const shimmerTranslate = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-80, 280],
  });

  // ─── Checking device ────────────────────────────────────────────────────────
  if (isCheckingDevice) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={[styles.fill, { backgroundColor: theme.background }]}>
          <View style={styles.centeredFill}>
            <ActivityIndicator size="large" color={theme.primary} />
            <Text style={[styles.checkingText, { color: theme.textSecondary }]}>
              Checking device…
            </Text>
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  // ─── Tablet block screen ────────────────────────────────────────────────────
  if (isTablet) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={[styles.fill, { backgroundColor: theme.background }]}>
          <StatusBar
            barStyle={isDark ? "light-content" : "dark-content"}
            backgroundColor={theme.background}
          />
          <View style={styles.tabletContainer}>
            <View style={[styles.tabletIconWrap, { backgroundColor: theme.featureIconBg }]}>
              <Text style={styles.tabletIconEmoji}>📱</Text>
            </View>

            <Text style={[styles.tabletTitle, { color: theme.primary }]}>
              Mobile Device Required
            </Text>

            <Text style={[styles.tabletBody, { color: theme.textSecondary }]}>
              This app is optimized for smartphones only. Please open it on
              your mobile phone for the best experience.
            </Text>

            <View style={styles.tabletWarnings}>
              {[
                "GPS accuracy is tuned for phone hardware",
                "Tablet screen layouts are not supported",
                "Some features require phone-only sensors",
              ].map((msg, i) => (
                <View key={i} style={styles.tabletWarningRow}>
                  <Text style={styles.tabletWarningIcon}>⚠️</Text>
                  <Text style={[styles.tabletWarningText, { color: theme.text }]}>
                    {msg}
                  </Text>
                </View>
              ))}
            </View>

            <Text
              style={[styles.tabletBtn, { backgroundColor: theme.primary }]}
              onPress={() =>
                Alert.alert(
                  "Switch to Phone",
                  "Please use this app on your smartphone for full functionality.",
                  [{ text: "OK" }]
                )
              }
            >
              I understand
            </Text>

            <Text style={[styles.tabletFooter, { color: theme.textTertiary }]}>
              GPS Vehicle Tracker • v1.0 • Phone only
            </Text>
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  // ─── Main loading screen ────────────────────────────────────────────────────
  return (
    <SafeAreaProvider>
      <SafeAreaView
        style={[styles.fill, { backgroundColor: theme.background }]}
        edges={["top", "left", "right"]}
      >
        <View style={[styles.fill, { backgroundColor: theme.background }]}>
          <Animated.View
            style={[
              styles.content,
              {
                opacity: fadeAnim,
                transform: [{ scale: scaleAnim }, { translateY: slideAnim }],
              },
            ]}
          >
            {/* ── GPS Ping + Logo ── */}
            <View style={styles.pingContainer}>
              {pingAnims.map((anim, i) => {
                const pingScale = anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.3, 1],
                });
                const pingOpacity = anim.interpolate({
                  inputRange: [0, 0.4, 1],
                  outputRange: [0.7, 0.3, 0],
                });
                return (
                  <Animated.View
                    key={i}
                    style={[
                      styles.pingRing,
                      {
                        borderColor: theme.pingColor,
                        transform: [{ scale: pingScale }],
                        opacity: pingOpacity,
                      },
                    ]}
                  />
                );
              })}

              <View
                style={[
                  styles.logoBox,
                  {
                    backgroundColor: theme.logoBg,
                    borderColor: theme.logoBorder,
                  },
                ]}
              >
                <Image
                  source={require("../../assets/tracking.png")}
                  style={styles.logoImage}
                  resizeMode="contain"
                />
              </View>
            </View>

            {/* ── Title ── */}
            <Text style={[styles.title, { color: theme.text }]}>
              GPS Vehicle Tracker
            </Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              Real-time location & ETA
            </Text>

            {/* ── Progress bar ── */}
            <View style={styles.progressSection}>
              <View
                style={[
                  styles.progressTrack,
                  { backgroundColor: theme.progressBg },
                ]}
              >
                <Animated.View
                  style={[
                    styles.progressFill,
                    { backgroundColor: theme.primary, width: progressWidth },
                  ]}
                >
                  {/* shimmer sweep */}
                  <Animated.View
                    style={[
                      styles.shimmer,
                      { transform: [{ translateX: shimmerTranslate }] },
                    ]}
                  />
                </Animated.View>
              </View>

              <View style={styles.progressMeta}>
                <Text style={[styles.phaseLabel, { color: theme.textSecondary }]}>
                  {getPhaseLabel(progress)}
                </Text>
                <Text style={[styles.percentLabel, { color: theme.primary }]}>
                  {progress}%
                </Text>
              </View>
            </View>

            {/* ── Status pills ── */}
            <View style={styles.pillsRow}>
              <View
                style={[
                  styles.pill,
                  {
                    backgroundColor: theme.pillBg,
                    borderColor: theme.pillBorder,
                  },
                ]}
              >
                <View
                  style={[
                    styles.pillDot,
                    { backgroundColor: isConnected ? "#34C759" : "#FF9500" },
                  ]}
                />
                <Text style={[styles.pillText, { color: theme.textSecondary }]}>
                  {isConnected ? "Connected" : "Offline mode"}
                </Text>
              </View>

              <View
                style={[
                  styles.pill,
                  {
                    backgroundColor: theme.pillBg,
                    borderColor: theme.pillBorder,
                  },
                ]}
              >
                <View style={[styles.pillDot, { backgroundColor: "#34C759" }]} />
                <Text style={[styles.pillText, { color: theme.textSecondary }]}>
                  Secure
                </Text>
              </View>
            </View>

            {/* ── Tip card ── */}
            <View
              style={[
                styles.tipCard,
                {
                  backgroundColor: theme.tipBg,
                  borderColor: theme.tipBorder,
                },
              ]}
            >
              <Text style={[styles.tipLabel, { color: theme.tipLabel }]}>
                Quick tip
              </Text>
              <Text style={[styles.tipText, { color: theme.tipText }]}>
                Enable location services for accurate real-time GPS tracking.
              </Text>
            </View>
          </Animated.View>
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const PING_SIZE = 200;

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  centeredFill: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  checkingText: {
    marginTop: 16,
    fontSize: 15,
    fontWeight: "500",
  },

  // ── Main content ──────────────────────────────────────────────────────────
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },

  // ── GPS Ping ──────────────────────────────────────────────────────────────
  pingContainer: {
    width: PING_SIZE,
    height: PING_SIZE,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 36,
  },
  pingRing: {
    position: "absolute",
    width: PING_SIZE,
    height: PING_SIZE,
    borderRadius: PING_SIZE / 2,
    borderWidth: 1.5,
  },
  logoBox: {
    width: 80,
    height: 80,
    borderRadius: 24,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 2,
  },
  logoImage: {
    width: 44,
    height: 44,
  },

  // ── Title ─────────────────────────────────────────────────────────────────
  title: {
    fontSize: 26,
    fontWeight: "700",
    letterSpacing: -0.5,
    textAlign: "center",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 15,
    fontWeight: "400",
    textAlign: "center",
    marginBottom: 44,
    opacity: 0.8,
  },

  // ── Progress ──────────────────────────────────────────────────────────────
  progressSection: {
    width: "85%",
    marginBottom: 28,
  },
  progressTrack: {
    width: "100%",
    height: 3,
    borderRadius: 2,
    overflow: "hidden",
    marginBottom: 10,
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
    overflow: "hidden",
  },
  shimmer: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 60,
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  progressMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  phaseLabel: {
    fontSize: 13,
    fontWeight: "400",
  },
  percentLabel: {
    fontSize: 13,
    fontWeight: "600",
  },

  // ── Pills ─────────────────────────────────────────────────────────────────
  pillsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 32,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
  },
  pillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  pillText: {
    fontSize: 13,
    fontWeight: "500",
  },

  // ── Tip card ──────────────────────────────────────────────────────────────
  tipCard: {
    width: "85%",
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
  },
  tipLabel: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.7,
    marginBottom: 4,
  },
  tipText: {
    fontSize: 13,
    lineHeight: 19,
  },

  // ── Tablet ────────────────────────────────────────────────────────────────
  tabletContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  tabletIconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 28,
  },
  tabletIconEmoji: {
    fontSize: 48,
  },
  tabletTitle: {
    fontSize: 26,
    fontWeight: "700",
    marginBottom: 12,
    textAlign: "center",
  },
  tabletBody: {
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 28,
  },
  tabletWarnings: {
    width: "100%",
    marginBottom: 32,
    gap: 14,
  },
  tabletWarningRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 8,
  },
  tabletWarningIcon: {
    fontSize: 18,
    marginRight: 10,
    lineHeight: 22,
  },
  tabletWarningText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  tabletBtn: {
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 14,
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 16,
    overflow: "hidden",
    marginBottom: 24,
    textAlign: "center",
  },
  tabletFooter: {
    fontSize: 12,
    textAlign: "center",
  },
});