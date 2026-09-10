import { DarkTheme, NavigationContainer, type Theme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { Text } from 'react-native';
import { LoadingView } from '../components';
import { useAuth } from '../state/AuthContext';
import { colors } from '../theme';
import type { RootStackParamList } from './types';

import { LoginScreen } from '../screens/shared/LoginScreen';
import { ForcePasswordResetScreen } from '../screens/shared/ForcePasswordResetScreen';
import { ProfileScreen } from '../screens/shared/ProfileScreen';
import { NotificationsScreen } from '../screens/shared/NotificationsScreen';
import { UserReportScreen } from '../screens/shared/UserReportScreen';

import { HomeScreen } from '../screens/rep/HomeScreen';
import { CourseScreen } from '../screens/rep/CourseScreen';
import { LessonPlayerScreen } from '../screens/rep/LessonPlayerScreen';
import { QuizScreen } from '../screens/rep/QuizScreen';
import { QuizResultScreen } from '../screens/rep/QuizResultScreen';
import { RewardsScreen } from '../screens/rep/RewardsScreen';

import { TeamDashboardScreen } from '../screens/manager/TeamDashboardScreen';

import { ContentScreen } from '../screens/admin/ContentScreen';
import { DriveBrowserScreen } from '../screens/admin/DriveBrowserScreen';
import { CourseSetupScreen } from '../screens/admin/CourseSetupScreen';
import { QuizBuilderScreen } from '../screens/admin/QuizBuilderScreen';
import { AssignCourseScreen } from '../screens/admin/AssignCourseScreen';
import { PeopleScreen } from '../screens/admin/PeopleScreen';
import { CreateUserScreen } from '../screens/admin/CreateUserScreen';
import { TrackerScreen } from '../screens/admin/TrackerScreen';
import { OverviewScreen } from '../screens/admin/OverviewScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator();

const navigationTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    primary: colors.primary,
    notification: colors.accent,
  },
};

const icon = (glyph: string) => {
  const TabIcon = ({ color }: { color: string }) => <Text style={{ fontSize: 20, color }}>{glyph}</Text>;
  TabIcon.displayName = `TabIcon(${glyph})`;
  return TabIcon;
};

const tabScreenOptions = {
  headerStyle: { backgroundColor: colors.bg },
  headerTintColor: colors.text,
  headerShadowVisible: false,
  headerTitleStyle: { fontWeight: '600' as const },
  tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
  tabBarActiveTintColor: colors.primary,
  tabBarInactiveTintColor: colors.textFaint,
};

/** Each role gets the tabs that match what it is allowed to do. */
function RoleTabs() {
  const { user } = useAuth();

  if (user?.role === 'MASTER_ADMIN') {
    return (
      <Tab.Navigator screenOptions={tabScreenOptions}>
        <Tab.Screen name="Overview" component={OverviewScreen} options={{ tabBarIcon: icon('🌍'), headerShown: false }} />
        <Tab.Screen name="Tracker" component={TrackerScreen} options={{ tabBarIcon: icon('📈'), headerShown: false }} />
        <Tab.Screen name="Content" component={ContentScreen} options={{ tabBarIcon: icon('📚'), headerShown: false }} />
        <Tab.Screen name="People" component={PeopleScreen} options={{ tabBarIcon: icon('👥'), headerShown: false }} />
        <Tab.Screen name="Profile" component={ProfileScreen} options={{ tabBarIcon: icon('👤'), headerShown: false }} />
      </Tab.Navigator>
    );
  }

  if (user?.role === 'HR_BP') {
    return (
      <Tab.Navigator screenOptions={tabScreenOptions}>
        <Tab.Screen name="Content" component={ContentScreen} options={{ tabBarIcon: icon('📚'), headerShown: false }} />
        <Tab.Screen name="Tracker" component={TrackerScreen} options={{ tabBarIcon: icon('📈'), headerShown: false }} />
        <Tab.Screen name="People" component={PeopleScreen} options={{ tabBarIcon: icon('👥'), headerShown: false }} />
        <Tab.Screen name="Profile" component={ProfileScreen} options={{ tabBarIcon: icon('👤'), headerShown: false }} />
      </Tab.Navigator>
    );
  }

  if (user?.role === 'SALES_MANAGER') {
    // Managers read team reports, and are course receivers themselves.
    return (
      <Tab.Navigator screenOptions={tabScreenOptions}>
        <Tab.Screen name="Team" component={TeamDashboardScreen} options={{ tabBarIcon: icon('📊'), headerShown: false }} />
        <Tab.Screen name="Learning" component={HomeScreen} options={{ tabBarIcon: icon('🎓'), headerShown: false }} />
        <Tab.Screen name="Rewards" component={RewardsScreen} options={{ tabBarIcon: icon('🎁'), headerShown: false }} />
        <Tab.Screen name="Profile" component={ProfileScreen} options={{ tabBarIcon: icon('👤'), headerShown: false }} />
      </Tab.Navigator>
    );
  }

  return (
    <Tab.Navigator screenOptions={tabScreenOptions}>
      <Tab.Screen name="Learning" component={HomeScreen} options={{ tabBarIcon: icon('🎓'), headerShown: false }} />
      <Tab.Screen name="Rewards" component={RewardsScreen} options={{ tabBarIcon: icon('🎁'), headerShown: false }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ tabBarIcon: icon('👤'), headerShown: false }} />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  const { user, mustResetPassword, isRestoring } = useAuth();

  if (isRestoring) return <LoadingView label="Signing you in…" />;

  return (
    <NavigationContainer theme={navigationTheme}>
      {!user ? (
        <LoginScreen />
      ) : mustResetPassword ? (
        <ForcePasswordResetScreen />
      ) : (
        <Stack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: colors.bg },
            headerTintColor: colors.text,
            headerShadowVisible: false,
            headerBackTitle: 'Back',
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          <Stack.Screen name="Tabs" component={RoleTabs} options={{ headerShown: false }} />
          <Stack.Screen name="Course" component={CourseScreen} options={{ title: 'Course' }} />
          <Stack.Screen name="LessonPlayer" component={LessonPlayerScreen} options={{ title: '' }} />
          <Stack.Screen name="Quiz" component={QuizScreen} options={{ title: 'Quiz' }} />
          <Stack.Screen
            name="QuizResult"
            component={QuizResultScreen}
            options={{ title: 'Your result', headerBackVisible: false }}
          />
          <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ title: 'Notifications' }} />
          <Stack.Screen
            name="UserReport"
            component={UserReportScreen}
            options={({ route }) => ({ title: route.params?.name ?? 'Training record' })}
          />
          <Stack.Screen name="DriveBrowser" component={DriveBrowserScreen} options={{ title: 'Google Drive' }} />
          <Stack.Screen name="CourseSetup" component={CourseSetupScreen} options={{ title: 'Course' }} />
          <Stack.Screen name="QuizBuilder" component={QuizBuilderScreen} options={{ title: 'Quiz builder' }} />
          <Stack.Screen name="AssignCourse" component={AssignCourseScreen} options={{ title: 'Assign' }} />
          <Stack.Screen name="CreateUser" component={CreateUserScreen} options={{ title: 'New login' }} />
        </Stack.Navigator>
      )}
    </NavigationContainer>
  );
}
