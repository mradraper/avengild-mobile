import { StyleSheet, Text, View } from 'react-native';

export default function CodexScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>The Codex</Text>
      <Text style={styles.subtitle}>Curate your own guides here.</Text>
      <Text style={styles.comingSoon}>(Coming Phase 4)</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center', 
    backgroundColor: '#f5f5f5' 
  },
  title: { 
    fontSize: 24, 
    fontWeight: 'bold', 
    marginBottom: 10 
  },
  subtitle: { 
    fontSize: 16, 
    color: '#666' 
  },
  comingSoon: { 
    marginTop: 20, 
    color: '#2e78b7', 
    fontWeight: 'bold' 
  }
});