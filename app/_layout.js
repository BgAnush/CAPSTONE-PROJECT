// app/_layout.js
import { Slot } from "expo-router";
import { Platform, View } from "react-native";

export default function Layout() {
  return (
    <View
      style={{
        flex: 1,
        ...(Platform.OS === "web" ? { minHeight: "100vh", overflowY: "auto" } : {}),
      }}
    >
      <Slot />
    </View>
  );
}
