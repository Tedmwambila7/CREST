import React, { useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./src/lib/supabase";

type Tab = "Home" | "Library" | "Assignments" | "Exams" | "Account";

const tabs: Tab[] = ["Home", "Library", "Assignments", "Exams", "Account"];

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("Home");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      if (error) console.warn("Session lookup:", error.message);
      setSession(data.session);
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function signIn() {
    if (!email.trim() || !password) {
      Alert.alert("Missing details", "Enter your email address and password.");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(), password
    });
    setBusy(false);
    if (error) Alert.alert("Sign in unsuccessful", error.message);
    else setSession(data.session);
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) Alert.alert("Could not sign out", error.message);
    else setSession(null);
  }

  if (loading) {
    return <SafeAreaView style={styles.center}><ActivityIndicator color="#55c8f2" /><Text style={styles.muted}>Loading CREST Academy…</Text></SafeAreaView>;
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="light" />
        <KeyboardAvoidingView style={styles.authWrap} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.brandMark}><Text style={styles.brandMarkText}>C</Text></View>
          <Text style={styles.kicker}>CREST ACADEMY INTERNATIONAL</Text>
          <Text style={styles.heading}>Welcome back</Text>
          <Text style={styles.muted}>Sign in with your CREST Academy account.</Text>
          <TextInput style={styles.input} placeholder="Email address" placeholderTextColor="#718096" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
          <TextInput style={styles.input} placeholder="Password" placeholderTextColor="#718096" secureTextEntry value={password} onChangeText={setPassword} />
          <Pressable style={[styles.primaryButton, busy && styles.disabled]} onPress={signIn} disabled={busy}>
            {busy ? <ActivityIndicator color="#071426" /> : <Text style={styles.primaryText}>Sign in</Text>}
          </Pressable>
          <Text style={styles.smallNote}>Use the account and sign-in method configured for your Supabase project.</Text>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <View><Text style={styles.kicker}>CREST ACADEMY</Text><Text style={styles.headerTitle}>Learning hub</Text></View>
        <View style={styles.avatar}><Text style={styles.avatarText}>{(session.user.email || "C").slice(0,1).toUpperCase()}</Text></View>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {tab === "Home" && <>
          <View style={styles.hero}>
            <Text style={styles.heroEyebrow}>YOUR LEARNING JOURNEY</Text>
            <Text style={styles.heroTitle}>Learn. Practise. Achieve.</Text>
            <Text style={styles.heroCopy}>Your CREST Academy learning space, now on mobile.</Text>
          </View>
          <Text style={styles.sectionTitle}>Quick access</Text>
          <View style={styles.grid}>
            {(["Library", "Assignments", "Exams"] as Tab[]).map((item) => (
              <Pressable key={item} style={styles.tile} onPress={() => setTab(item)}>
                <Text style={styles.tileIcon}>{item === "Library" ? "▤" : item === "Assignments" ? "✎" : "✓"}</Text>
                <Text style={styles.tileTitle}>{item}</Text>
                <Text style={styles.tileHint}>Open {item.toLowerCase()}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.sectionTitle}>Account</Text>
          <Text style={styles.muted}>Signed in as {session.user.email || "CREST learner"}.</Text>
        </>}
        {tab === "Library" && <Placeholder title="Learning library" detail="The mobile library screen is ready to connect to the existing CREST library records and document storage." />}
        {tab === "Assignments" && <Placeholder title="Assignments" detail="This screen will show assigned work, due dates, uploads and teacher feedback from the existing CREST system." />}
        {tab === "Exams" && <Placeholder title="Examination centre" detail="This screen will connect to the CREST examination module for available tests, submissions and released results." />}
        {tab === "Account" && <>
          <Text style={styles.sectionTitle}>Your account</Text>
          <View style={styles.panel}><Text style={styles.panelTitle}>Signed in</Text><Text style={styles.muted}>{session.user.email}</Text></View>
          <Pressable style={styles.secondaryButton} onPress={signOut}><Text style={styles.secondaryText}>Sign out</Text></Pressable>
        </>}
      </ScrollView>
      <View style={styles.tabBar}>
        {tabs.map((item) => <Pressable key={item} style={styles.tab} onPress={() => setTab(item)}>
          <Text style={[styles.tabText, tab === item && styles.tabActive]}>{item}</Text>
        </Pressable>)}
      </View>
    </SafeAreaView>
  );
}

function Placeholder({ title, detail }: { title: string; detail: string }) {
  return <View style={styles.panel}><Text style={styles.sectionTitle}>{title}</Text><Text style={styles.muted}>{detail}</Text><Text style={styles.smallNote}>Integration stage: connect this screen to the matching existing Supabase tables and policies before release.</Text></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#071426" },
  center: { flex: 1, backgroundColor: "#071426", alignItems: "center", justifyContent: "center", gap: 12 },
  authWrap: { flex: 1, justifyContent: "center", padding: 26 },
  brandMark: { width: 58, height: 58, borderRadius: 18, backgroundColor: "#55c8f2", alignItems: "center", justifyContent: "center", marginBottom: 22 },
  brandMarkText: { color: "#071426", fontSize: 34, fontWeight: "900" },
  kicker: { color: "#55c8f2", fontSize: 11, fontWeight: "800", letterSpacing: 2 },
  heading: { color: "#f5f8fc", fontSize: 30, fontWeight: "800", marginTop: 10 },
  muted: { color: "#a7b6c9", fontSize: 14, lineHeight: 22, marginTop: 8 },
  input: { backgroundColor: "#10233b", color: "#f5f8fc", borderWidth: 1, borderColor: "#29415e", borderRadius: 12, padding: 15, marginTop: 16, fontSize: 16 },
  primaryButton: { backgroundColor: "#55c8f2", borderRadius: 12, padding: 15, alignItems: "center", marginTop: 20 },
  primaryText: { color: "#071426", fontWeight: "800", fontSize: 15 },
  disabled: { opacity: 0.6 },
  smallNote: { color: "#71869f", fontSize: 12, lineHeight: 18, marginTop: 18 },
  header: { paddingHorizontal: 22, paddingVertical: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: "#1b3049" },
  headerTitle: { color: "#f5f8fc", fontSize: 22, fontWeight: "800", marginTop: 4 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#173b5a", alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#55c8f2", fontWeight: "800", fontSize: 17 },
  content: { padding: 20, paddingBottom: 28 },
  hero: { backgroundColor: "#102c4a", borderWidth: 1, borderColor: "#285274", borderRadius: 20, padding: 22, marginBottom: 24 },
  heroEyebrow: { color: "#79d9f7", fontSize: 10, fontWeight: "800", letterSpacing: 1.5 },
  heroTitle: { color: "#fff", fontSize: 25, fontWeight: "800", marginTop: 12 },
  heroCopy: { color: "#c0d4e8", fontSize: 14, lineHeight: 21, marginTop: 8 },
  sectionTitle: { color: "#f5f8fc", fontSize: 18, fontWeight: "800", marginBottom: 12, marginTop: 10 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 18 },
  tile: { width: "48%", minHeight: 118, padding: 16, backgroundColor: "#10233b", borderColor: "#29415e", borderWidth: 1, borderRadius: 16 },
  tileIcon: { color: "#55c8f2", fontSize: 23, fontWeight: "800" },
  tileTitle: { color: "#f5f8fc", fontSize: 15, fontWeight: "800", marginTop: 10 },
  tileHint: { color: "#8ea4bc", fontSize: 11, marginTop: 4 },
  panel: { backgroundColor: "#10233b", borderColor: "#29415e", borderWidth: 1, borderRadius: 16, padding: 20, marginTop: 12 },
  panelTitle: { color: "#f5f8fc", fontWeight: "800", fontSize: 16 },
  secondaryButton: { backgroundColor: "#1b3049", padding: 14, borderRadius: 12, alignItems: "center", marginTop: 20 },
  secondaryText: { color: "#f5f8fc", fontWeight: "800" },
  tabBar: { flexDirection: "row", justifyContent: "space-around", paddingVertical: 12, paddingHorizontal: 4, borderTopWidth: 1, borderTopColor: "#1b3049", backgroundColor: "#091a2e" },
  tab: { paddingVertical: 6, paddingHorizontal: 5 },
  tabText: { color: "#71869f", fontSize: 11, fontWeight: "700" },
  tabActive: { color: "#55c8f2" },
});
