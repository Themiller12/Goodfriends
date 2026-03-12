import React, {useEffect, useState} from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert} from 'react-native';
import ApiClient from '../services/ApiClient';
import API_CONFIG from '../config/api';

const TestAPIScreen: React.FC = () => {
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (message: string) => {
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  const testAPIConnection = async () => {
    addLog('🔄 Test de connexion à l\'API...');
    addLog(`📡 URL: ${API_CONFIG.BASE_URL}`);
    
    try {
      // Test simple avec fetch
      addLog('⏳ Test avec fetch...');
      const response = await fetch(`${API_CONFIG.BASE_URL}/auth.php?action=test`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      addLog(`✅ Réponse HTTP: ${response.status} ${response.statusText}`);
      const text = await response.text();
      addLog(`📄 Corps: ${text.substring(0, 100)}`);
      
    } catch (error: any) {
      addLog(`❌ Erreur: ${error.message}`);
      addLog(`📋 Type: ${error.name}`);
      addLog(`🔍 Code: ${error.code || 'N/A'}`);
    }
  };

  const testRegister = async () => {
    addLog('🔄 Test d\'inscription...');
    
    try {
      const testData = {
        email: `test${Date.now()}@test.com`,
        password: 'test123456',
        firstName: 'Test',
        lastName: 'User'
      };
      
      addLog(`📤 Envoi: ${JSON.stringify(testData)}`);
      
      const response = await fetch(`${API_CONFIG.BASE_URL}/auth.php?action=register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(testData),
      });
      
      addLog(`✅ Réponse HTTP: ${response.status}`);
      const json = await response.json();
      addLog(`📄 Réponse: ${JSON.stringify(json)}`);
      
    } catch (error: any) {
      addLog(`❌ Erreur: ${error.message}`);
    }
  };

  const clearLogs = () => {
    setLogs([]);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Test API Goodfriends</Text>
      
      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.button} onPress={testAPIConnection}>
          <Text style={styles.buttonText}>Test Connexion</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={[styles.button, styles.buttonSecondary]} onPress={testRegister}>
          <Text style={styles.buttonText}>Test Inscription</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={[styles.button, styles.buttonDanger]} onPress={clearLogs}>
          <Text style={styles.buttonText}>Effacer</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.logContainer}>
        {logs.map((log, index) => (
          <Text key={index} style={styles.logText}>{log}</Text>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  button: {
    flex: 1,
    backgroundColor: '#2196F3',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonSecondary: {
    backgroundColor: '#4CAF50',
  },
  buttonDanger: {
    backgroundColor: '#f44336',
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  logContainer: {
    flex: 1,
    backgroundColor: '#1e1e1e',
    padding: 10,
    borderRadius: 8,
  },
  logText: {
    color: '#00ff00',
    fontFamily: 'monospace',
    fontSize: 12,
    marginBottom: 5,
  },
});

export default TestAPIScreen;
