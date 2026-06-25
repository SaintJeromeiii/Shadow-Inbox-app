import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  Dimensions,
  PanResponder,
} from 'react-native';
import { useEffect, useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { maskEmail } from '../constants/accounts';
import type { AccountKey, AccountProfile } from '../types/account';

const SCREEN_HEIGHT = Dimensions.get('window').height;

interface AccountSwitcherSheetProps {
  visible: boolean;
  accounts: AccountProfile[];
  activeAccount: AccountKey;
  onSelect: (accountKey: AccountKey) => void;
  onAddGoogle: () => void;
  isAddingGoogle?: boolean;
  onClose: () => void;
}

export default function AccountSwitcherSheet({
  visible,
  accounts,
  activeAccount,
  onSelect,
  onAddGoogle,
  isAddingGoogle = false,
  onClose,
}: AccountSwitcherSheetProps) {
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: visible ? 0 : SCREEN_HEIGHT,
      useNativeDriver: true,
      damping: 24,
      stiffness: 220,
    }).start();
  }, [slideAnim, visible]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => gesture.dy > 8,
      onPanResponderMove: (_, gesture) => {
        if (gesture.dy > 0) {
          slideAnim.setValue(gesture.dy);
        }
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > 100 || gesture.vy > 0.8) {
          onClose();
        } else {
          Animated.spring(slideAnim, {
            toValue: 0,
            useNativeDriver: true,
            damping: 24,
            stiffness: 220,
          }).start();
        }
      },
    }),
  ).current;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <Animated.View
          style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}
          {...panResponder.panHandlers}
        >
          <View style={styles.handle} />
          <Text style={styles.title}>Switch Inbox</Text>
          <Text style={styles.subtitle}>Choose which account feed to triage</Text>

          <View style={styles.accountList}>
            {accounts.map((account) => {
              const selected = account.key === activeAccount;
              return (
                <Pressable
                  key={account.key}
                  style={({ pressed }) => [
                    styles.accountRow,
                    selected && styles.accountRowSelected,
                    pressed && styles.accountRowPressed,
                  ]}
                  onPress={() => onSelect(account.key)}
                >
                  <View
                    style={[
                      styles.avatar,
                      { backgroundColor: account.accentColor },
                    ]}
                  >
                    <Text style={styles.avatarText}>{account.initials}</Text>
                  </View>
                  <View style={styles.accountCopy}>
                    <Text style={styles.accountLabel}>{account.label}</Text>
                    <Text style={styles.accountEmail}>{maskEmail(account.email)}</Text>
                  </View>
                  {selected ? (
                    <Ionicons name="checkmark-circle" size={22} color="#6EE7A0" />
                  ) : (
                    <Ionicons name="chevron-forward" size={18} color="#5C6478" />
                  )}
                </Pressable>
              );
            })}
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.addGoogleButton,
              pressed && !isAddingGoogle && styles.addGoogleButtonPressed,
              isAddingGoogle && styles.addGoogleButtonDisabled,
            ]}
            onPress={onAddGoogle}
            disabled={isAddingGoogle}
          >
            {isAddingGoogle ? (
              <Ionicons name="hourglass-outline" size={18} color="#6EE7A0" />
            ) : (
              <Text style={styles.addGoogleIcon}>➕</Text>
            )}
            <Text style={styles.addGoogleText}>Add Google Account</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(8, 10, 14, 0.72)',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    backgroundColor: '#141824',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 34,
    borderWidth: 1,
    borderColor: '#2A3142',
    borderBottomWidth: 0,
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#3A4258',
    marginBottom: 18,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  subtitle: {
    color: '#6B7288',
    fontSize: 14,
    marginTop: 4,
    marginBottom: 18,
  },
  accountList: {
    gap: 10,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#10141D',
    borderWidth: 1,
    borderColor: '#232A38',
  },
  accountRowSelected: {
    borderColor: '#5B8DEF',
    backgroundColor: '#161D2C',
  },
  accountRowPressed: {
    opacity: 0.88,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#0D0F14',
    fontSize: 15,
    fontWeight: '800',
  },
  accountCopy: {
    flex: 1,
    gap: 2,
  },
  accountLabel: {
    color: '#F4F6FB',
    fontSize: 15,
    fontWeight: '700',
  },
  accountEmail: {
    color: '#8B93A8',
    fontSize: 13,
  },
  addGoogleButton: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(110, 231, 160, 0.35)',
    backgroundColor: 'rgba(110, 231, 160, 0.08)',
  },
  addGoogleButtonPressed: {
    opacity: 0.86,
  },
  addGoogleButtonDisabled: {
    opacity: 0.6,
  },
  addGoogleIcon: {
    fontSize: 16,
  },
  addGoogleText: {
    color: '#6EE7A0',
    fontSize: 15,
    fontWeight: '800',
  },
});
