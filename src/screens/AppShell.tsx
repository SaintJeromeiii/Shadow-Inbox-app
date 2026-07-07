import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import HomeScreen from './HomeScreen';
import HeroStatusScreen from './HeroStatusScreen';
import IntelDeckScreen from './IntelDeckScreen';
import KnowledgeScreen from './KnowledgeScreen';
import AutoPilotScreen from './AutoPilotScreen';
import AdminLogsScreen from './AdminLogsScreen';
import FirewallSettings from './FirewallSettings';
import CharacterSelectScreen from './CharacterSelectScreen';
import CharacterRankingScreen from './CharacterRankingScreen';
import QuantumRealmTransitionScreen from './QuantumRealmTransitionScreen';
import SettingsScreen from './SettingsScreen';
import RunCostScreen from './RunCostScreen';
import SideDeckDrawer from '../components/SideDeckDrawer';
import { useAccount } from '../context/AccountContext';
import { useCharacter } from '../context/CharacterContext';
import { useRegisterPushNavigation } from '../context/PushNavigationContext';
import { shouldEnterQuantumRealm } from '../utils/characterTransition';
import { stopAllCharacterIntroAmbience } from '../services/retroSoundService';
import { fetchAiUsage } from '../services/aiUsageService';
import type { DrawerRoute } from '../types/navigation';

function ScreenSlot({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  return (
    <View
      style={[styles.screenSlot, active ? styles.screenSlotActive : styles.screenSlotHidden]}
      pointerEvents={active ? 'auto' : 'none'}
    >
      {children}
    </View>
  );
}

export default function AppShell() {
  const { activeAccount, accounts, setActiveAccount } = useAccount();
  const { characterId, selectCharacter } = useCharacter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showOpsConsole, setShowOpsConsole] = useState(false);
  const [route, setRoute] = useState<DrawerRoute>('play_stage');
  const [pendingFocusEmailId, setPendingFocusEmailId] = useState<string | null>(null);
  const [notificationsSnapshot, setNotificationsSnapshot] = useState<
    import('../types/notification').TriagedNotification[]
  >([]);
  const [showQuantumTransition, setShowQuantumTransition] = useState(false);

  const openDrawer = useCallback(() => {
    setDrawerOpen(true);
  }, []);

  const handleNavigate = useCallback((nextRoute: DrawerRoute) => {
    if (nextRoute === 'admin_logs' && !showOpsConsole) {
      return;
    }
    setRoute(nextRoute);
    setDrawerOpen(false);
  }, [showOpsConsole]);

  useEffect(() => {
    let cancelled = false;

    void fetchAiUsage().then((usage) => {
      if (!cancelled) {
        setShowOpsConsole(Boolean(usage?.exempt));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [activeAccount]);

  const handleJumpToEmail = useCallback((emailId: string) => {
    setPendingFocusEmailId(emailId);
    setRoute('play_stage');
    setDrawerOpen(false);
  }, []);

  useRegisterPushNavigation(
    useCallback(
      (payload) => {
        if (
          payload.accountKey &&
          payload.accountKey !== activeAccount &&
          accounts.some((account) => account.key === payload.accountKey)
        ) {
          void setActiveAccount(payload.accountKey);
        }

        handleJumpToEmail(payload.notificationId);
      },
      [accounts, activeAccount, handleJumpToEmail, setActiveAccount],
    ),
  );

  const goToPlayStage = useCallback(() => {
    setRoute('play_stage');
  }, []);

  const handleFighterConfirm = useCallback(
    (nextCharacterId: typeof characterId) => {
      stopAllCharacterIntroAmbience();
      void selectCharacter(nextCharacterId).then(() => {
        if (shouldEnterQuantumRealm(nextCharacterId)) {
          setShowQuantumTransition(true);
        } else {
          setRoute('play_stage');
        }
      });
    },
    [selectCharacter],
  );

  return (
    <View style={styles.shell}>
      <ScreenSlot active={route === 'play_stage'}>
        <HomeScreen
          onOpenDrawer={openDrawer}
          focusEmailId={pendingFocusEmailId}
          onFocusEmailHandled={() => setPendingFocusEmailId(null)}
          onNotificationsChange={setNotificationsSnapshot}
          isScreenFocused={route === 'play_stage'}
        />
      </ScreenSlot>

      <ScreenSlot active={route === 'fighter_select'}>
        <CharacterSelectScreen
          variant="switch"
          isActive={route === 'fighter_select'}
          initialCharacterId={characterId}
          onConfirm={handleFighterConfirm}
          onCancel={goToPlayStage}
          onOpenDrawer={openDrawer}
        />
      </ScreenSlot>

      <ScreenSlot active={route === 'fighter_rankings'}>
        <CharacterRankingScreen onOpenDrawer={openDrawer} />
      </ScreenSlot>

      <ScreenSlot active={route === 'hero_status'}>
        <HeroStatusScreen
          onOpenDrawer={openDrawer}
          isScreenFocused={route === 'hero_status'}
        />
      </ScreenSlot>

      <ScreenSlot active={route === 'intel_deck'}>
        <IntelDeckScreen
          onOpenDrawer={openDrawer}
          onJumpToEmail={handleJumpToEmail}
          notifications={notificationsSnapshot}
          isScreenFocused={route === 'intel_deck'}
        />
      </ScreenSlot>

      <ScreenSlot active={route === 'run_cost'}>
        <RunCostScreen
          onOpenDrawer={openDrawer}
          isScreenFocused={route === 'run_cost'}
        />
      </ScreenSlot>

      <ScreenSlot active={route === 'firewall_config'}>
        <FirewallSettings
          visible
          variant="screen"
          accountKey={activeAccount}
          onClose={goToPlayStage}
          onOpenDrawer={openDrawer}
        />
      </ScreenSlot>

      <ScreenSlot active={route === 'auto_pilot'}>
        <AutoPilotScreen
          visible
          variant="screen"
          onClose={goToPlayStage}
          onOpenDrawer={openDrawer}
        />
      </ScreenSlot>

      <ScreenSlot active={route === 'knowledge_core'}>
        <KnowledgeScreen
          visible
          variant="screen"
          onClose={goToPlayStage}
          onOpenDrawer={openDrawer}
        />
      </ScreenSlot>

      <ScreenSlot active={route === 'admin_logs'}>
        <AdminLogsScreen
          visible={route === 'admin_logs'}
          variant="screen"
          onClose={goToPlayStage}
          onOpenDrawer={openDrawer}
        />
      </ScreenSlot>

      <ScreenSlot active={route === 'settings'}>
        <SettingsScreen
          visible={route === 'settings'}
          variant="screen"
          onClose={goToPlayStage}
          onOpenDrawer={openDrawer}
        />
      </ScreenSlot>

      <SideDeckDrawer
        open={drawerOpen}
        activeRoute={route}
        onNavigate={handleNavigate}
        onClose={() => setDrawerOpen(false)}
        showOpsConsole={showOpsConsole}
      />

      {showQuantumTransition ? (
        <View style={styles.quantumOverlay}>
          <QuantumRealmTransitionScreen
            onComplete={() => {
              setShowQuantumTransition(false);
              setRoute('play_stage');
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
  },
  screenSlot: {
    ...StyleSheet.absoluteFillObject,
  },
  screenSlotActive: {
    zIndex: 1,
  },
  screenSlotHidden: {
    opacity: 0,
    zIndex: 0,
  },
  quantumOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
  },
});
