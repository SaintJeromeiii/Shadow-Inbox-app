import { Image, StyleSheet, View } from 'react-native';
import type { ImageSourcePropType } from 'react-native';
import type { PlayerTier } from '../types/userProgress';

const TIER_IMAGES: Record<PlayerTier, ImageSourcePropType> = {
  1: require('../../assets/images/tier1_civilian.png'),
  2: require('../../assets/images/tier2_soldier.png'),
  3: require('../../assets/images/tier3_commando.png'),
  4: require('../../assets/images/tier4_deity.png'),
};

export function PlayerAvatarSprite({ tier }: { tier: PlayerTier }) {
  return (
    <View style={styles.frame}>
      <Image
        key={`tier-${tier}`}
        source={TIER_IMAGES[tier]}
        style={styles.image}
        resizeMode="contain"
        accessibilityLabel={`${tier} player avatar`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
