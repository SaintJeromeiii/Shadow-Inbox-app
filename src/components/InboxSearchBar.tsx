import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { arcadeColors, arcadeFonts } from '../theme/arcadeTheme';

interface InboxSearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
}

export default function InboxSearchBar({
  value,
  onChangeText,
}: InboxSearchBarProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.field}>
        <Ionicons name="search" size={18} color={arcadeColors.textMuted} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder="Search sender, subject, or body"
          placeholderTextColor={arcadeColors.textMuted}
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="never"
          returnKeyType="search"
          accessibilityLabel="Search inbox"
        />
        {value.length > 0 ? (
          <Pressable
            onPress={() => onChangeText('')}
            hitSlop={8}
            accessibilityLabel="Clear search"
          >
            <Ionicons name="close-circle" size={18} color={arcadeColors.textMuted} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 6,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: arcadeColors.borderCyan,
    backgroundColor: arcadeColors.bgPanel,
  },
  input: {
    flex: 1,
    color: arcadeColors.textPrimary,
    fontFamily: arcadeFonts.body,
    fontSize: 14,
    paddingVertical: 0,
  },
});
