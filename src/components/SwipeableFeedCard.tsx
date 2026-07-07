import { useCallback, useEffect, useRef } from 'react';
import {
  Animated,
  PanResponder,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import FeedCard, { type FeedCardProps } from './FeedCard';
import type { InboxSwipeAction } from '../services/inboxSwipeStorage';
import { arcadeColors, arcadeFonts } from '../theme/arcadeTheme';
import { ArcadeArchiveIcon, ArcadeTrashIcon } from './ArcadeIcons';

const SWIPE_TRIGGER_RATIO = 0.38;
const MIN_SWIPE_TRIGGER_PX = 72;

interface SwipeableFeedCardProps extends FeedCardProps {
  swipeLeftAction: InboxSwipeAction;
  swipeRightAction: InboxSwipeAction;
  swipeEnabled?: boolean;
}

function actionLabel(action: InboxSwipeAction): string {
  return action === 'archive' ? 'ARCHIVE' : 'TRASH';
}

function actionColor(action: InboxSwipeAction): string {
  return action === 'archive' ? arcadeColors.neonCyan : arcadeColors.neonRed;
}

export default function SwipeableFeedCard({
  swipeLeftAction,
  swipeRightAction,
  swipeEnabled = true,
  onGmailArchive,
  onTrash,
  notification,
  selectionMode,
  actionBusy,
  isRemoving,
  ...feedCardProps
}: SwipeableFeedCardProps) {
  const translateX = useRef(new Animated.Value(0)).current;
  const cardWidth = useRef(320);
  const cardExpanded = useRef(false);
  const swipeActive = useRef(false);

  const swipeContext = useRef({
    swipeEnabled,
    selectionMode,
    actionBusy,
    isRemoving,
    swipeLeftAction,
    swipeRightAction,
  });

  useEffect(() => {
    swipeContext.current = {
      swipeEnabled,
      selectionMode,
      actionBusy,
      isRemoving,
      swipeLeftAction,
      swipeRightAction,
    };
  }, [
    swipeEnabled,
    selectionMode,
    actionBusy,
    isRemoving,
    swipeLeftAction,
    swipeRightAction,
  ]);

  const getTriggerThreshold = useCallback(
    () => Math.max(MIN_SWIPE_TRIGGER_PX, cardWidth.current * SWIPE_TRIGGER_RATIO),
    [],
  );

  const resetPosition = useCallback(() => {
    Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
      bounciness: 0,
      speed: 20,
    }).start();
  }, [translateX]);

  const runSwipeAction = useCallback(
    async (action: InboxSwipeAction) => {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      if (action === 'archive') {
        await onGmailArchive(notification);
      } else {
        await onTrash(notification);
      }
    },
    [notification, onGmailArchive, onTrash],
  );

  const runSwipeActionRef = useRef(runSwipeAction);
  runSwipeActionRef.current = runSwipeAction;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => {
        const ctx = swipeContext.current;
        if (
          !ctx.swipeEnabled ||
          ctx.selectionMode ||
          ctx.actionBusy ||
          ctx.isRemoving ||
          cardExpanded.current
        ) {
          return false;
        }

        return (
          Math.abs(gesture.dx) > 10 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.4
        );
      },
      onPanResponderGrant: () => {
        swipeActive.current = true;
      },
      onPanResponderMove: (_, gesture) => {
        const maxDrag = getTriggerThreshold() * 1.35;
        const clamped = Math.max(-maxDrag, Math.min(maxDrag, gesture.dx));
        translateX.setValue(clamped);
      },
      onPanResponderRelease: (_, gesture) => {
        swipeActive.current = false;
        const threshold = getTriggerThreshold();
        const ctx = swipeContext.current;

        if (gesture.dx <= -threshold) {
          void runSwipeActionRef.current(ctx.swipeLeftAction);
          resetPosition();
          return;
        }

        if (gesture.dx >= threshold) {
          void runSwipeActionRef.current(ctx.swipeRightAction);
          resetPosition();
          return;
        }

        resetPosition();
      },
      onPanResponderTerminate: () => {
        swipeActive.current = false;
        resetPosition();
      },
      onPanResponderTerminationRequest: () => !swipeActive.current,
    }),
  ).current;

  const handleLayout = (event: LayoutChangeEvent) => {
    cardWidth.current = event.nativeEvent.layout.width || cardWidth.current;
  };

  const handleExpandedChange = (expanded: boolean) => {
    cardExpanded.current = expanded;
  };

  const triggerThreshold = getTriggerThreshold();

  const leftBackgroundOpacity = translateX.interpolate({
    inputRange: [0, triggerThreshold],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const rightBackgroundOpacity = translateX.interpolate({
    inputRange: [-triggerThreshold, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const canSwipe =
    swipeEnabled && !selectionMode && !actionBusy && !isRemoving;

  return (
    <View style={styles.container} onLayout={handleLayout}>
      <View style={styles.actionsRow} pointerEvents="none">
        <Animated.View
          style={[
            styles.actionBackground,
            styles.leftAction,
            {
              backgroundColor: actionColor(swipeRightAction),
              opacity: leftBackgroundOpacity,
            },
          ]}
        >
          {swipeRightAction === 'archive' ? (
            <ArcadeArchiveIcon size={22} color={arcadeColors.bgDeep} />
          ) : (
            <ArcadeTrashIcon size={22} color={arcadeColors.bgDeep} />
          )}
          <Text style={styles.actionLabel}>{actionLabel(swipeRightAction)}</Text>
        </Animated.View>

        <Animated.View
          style={[
            styles.actionBackground,
            styles.rightAction,
            {
              backgroundColor: actionColor(swipeLeftAction),
              opacity: rightBackgroundOpacity,
            },
          ]}
        >
          {swipeLeftAction === 'archive' ? (
            <ArcadeArchiveIcon size={22} color={arcadeColors.bgDeep} />
          ) : (
            <ArcadeTrashIcon size={22} color={arcadeColors.bgDeep} />
          )}
          <Text style={styles.actionLabel}>{actionLabel(swipeLeftAction)}</Text>
        </Animated.View>
      </View>

      <Animated.View
        style={{ transform: [{ translateX }] }}
        {...(canSwipe ? panResponder.panHandlers : {})}
      >
        <FeedCard
          notification={notification}
          onGmailArchive={onGmailArchive}
          onTrash={onTrash}
          selectionMode={selectionMode}
          actionBusy={actionBusy}
          isRemoving={isRemoving}
          onExpandedChange={handleExpandedChange}
          {...feedCardProps}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 10,
  },
  actionsRow: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
  },
  actionBackground: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
  },
  leftAction: {
    justifyContent: 'flex-start',
  },
  rightAction: {
    justifyContent: 'flex-end',
  },
  actionLabel: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 8,
    lineHeight: 12,
    color: arcadeColors.bgDeep,
  },
});
