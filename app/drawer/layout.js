// app/drawer/layout.js
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function Layout({ onClose }) {
  const menuItems = [
    { icon: 'home-outline', label: 'Dashboard' },
    { icon: 'add-circle-outline', label: 'Add Product' },
    { icon: 'chatbubbles-outline', label: 'Negotiations' },
    { icon: 'warning-outline', label: 'Disease Alerts' },
    { icon: 'person-outline', label: 'Profile' },
  ];

  return (
    <View style={styles.drawer}>
      {menuItems.map((item, idx) => (
        <TouchableOpacity key={idx} style={styles.item}>
          <Ionicons name={item.icon} size={20} color="#4CAF50" />
          <Text style={styles.label}>{item.label}</Text>
        </TouchableOpacity>
      ))}

      <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
        <Text style={styles.closeText}>✖ Close</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  drawer: {
    width: '25%',
    height: '100%',
    backgroundColor: '#fff',
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 100,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowOffset: { width: 2, height: 0 },
    shadowRadius: 5,
    elevation: 10,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 12,
  },
  label: {
    marginLeft: 10,
    fontSize: 16,
    color: '#333',
  },
  closeBtn: {
    marginTop: 30,
  },
  closeText: {
    fontSize: 16,
    color: '#E53935',
  },
});
