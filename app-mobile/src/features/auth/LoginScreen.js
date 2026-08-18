import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { funcionarios } from '../../mocks/db';

export default function LoginScreen({ navigation }) {
  const [codigo, setCodigo] = useState('');
  const [pin, setPin] = useState('');

  const handleLogin = () => {
    // Basic mock authentication
    const user = funcionarios.find(f => f.codigo_funcionario === codigo);
    
    if (user && pin.length === 6) {
      // In a real app, we'd hash and verify PIN. Here we just accept any 6 digits for the valid codigos.
      navigation.replace('Painel', { separadorId: user.id, nome: user.nome });
    } else {
      Alert.alert('Erro', 'Código ou PIN inválido. Verifique e tente novamente.');
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        <View style={styles.logoContainer}>
          <Text style={styles.logoIcon}>📦</Text>
        </View>
        <Text style={styles.title}>Papelaria Venâncio</Text>
        <Text style={styles.subtitle}>Acesso da equipe</Text>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>CÓDIGO DO FUNCIONÁRIO</Text>
          <TextInput
            style={styles.input}
            value={codigo}
            onChangeText={setCodigo}
            keyboardType="number-pad"
            maxLength={10}
            placeholder="Ex: 0231"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>PIN (6 DÍGITOS)</Text>
          <TextInput
            style={[styles.input, { letterSpacing: 10 }]}
            value={pin}
            onChangeText={setPin}
            keyboardType="number-pad"
            maxLength={6}
            secureTextEntry
            placeholder="••••••"
          />
        </View>

        <TouchableOpacity style={styles.button} onPress={handleLogin}>
          <Text style={styles.buttonText}>Entrar</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FB',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 28,
  },
  logoContainer: {
    width: 72,
    height: 72,
    backgroundColor: '#1B5FAE',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 20,
  },
  logoIcon: {
    fontSize: 34,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1C2033',
    textAlign: 'center',
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 13,
    color: '#8B91A3',
    textAlign: 'center',
    marginBottom: 36,
  },
  inputGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#5B6072',
    marginBottom: 8,
  },
  input: {
    height: 52,
    backgroundColor: '#FAFBFD',
    borderWidth: 1.5,
    borderColor: '#E4E8F0',
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 17,
    fontWeight: '700',
    color: '#1C2033',
  },
  button: {
    height: 56,
    backgroundColor: '#1B5FAE',
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
