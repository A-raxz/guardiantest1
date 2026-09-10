import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppButton, Card, ProgressBar, Row, Screen } from '../../components';
import type { RootStackParamList } from '../../navigation/types';
import { colors, radius, spacing, typography } from '../../theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** Score, what was missed, and the XP earned. */
export function QuizResultScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'QuizResult'>>();
  const navigation = useNavigation<Nav>();
  const { result } = route.params;

  return (
    <Screen scroll>
      <LinearGradient
        colors={result.passed ? ['#123A2B', '#141C2E'] : ['#3A1A1F', '#141C2E']}
        style={styles.hero}
      >
        <Text style={styles.emoji}>{result.passed ? '🎉' : '💪'}</Text>
        <Text style={styles.score}>{result.score}%</Text>
        <Text style={styles.headline}>
          {result.passed ? 'Passed' : `Not quite — you need ${result.passScore}%`}
        </Text>
        <Text style={styles.sub}>
          {result.correctCount} of {result.totalQuestions} correct
        </Text>

        {result.xpAwarded > 0 ? (
          <View style={styles.xpBadge}>
            <Text style={styles.xpBadgeText}>+{result.xpAwarded} XP</Text>
          </View>
        ) : null}
      </LinearGradient>

      {result.courseBonusXp > 0 ? (
        <Card style={styles.bonusCard}>
          <Text style={styles.bonusTitle}>Course complete 🏆</Text>
          <Text style={styles.bonusBody}>
            +{result.courseBonusXp} XP bonus
            {result.certificate ? ` · certificate ${result.certificate.serial} issued` : ''}
          </Text>
        </Card>
      ) : null}

      <Card>
        <Row style={{ marginBottom: spacing.sm }}>
          <Text style={styles.levelLabel}>
            Level {result.xp.level} · {result.xp.title}
          </Text>
          <View style={{ flex: 1 }} />
          <Text style={styles.levelLabel}>{result.xp.xpTotal} XP</Text>
        </Row>
        <ProgressBar percent={result.xp.progress * 100} />
        <Text style={styles.levelHint}>
          {result.xp.xpForNextLevel - result.xp.xpIntoLevel} XP to level {result.xp.level + 1}
        </Text>
      </Card>

      <Text style={styles.sectionTitle}>Your answers</Text>
      {result.results.map((item, index) => (
        <Card key={item.questionId}>
          <Row style={{ alignItems: 'flex-start' }}>
            <Text style={styles.mark}>{item.correct ? '✅' : '❌'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.question}>
                {index + 1}. {item.prompt}
              </Text>
              {!item.correct && item.explanation ? (
                <Text style={styles.explanation}>{item.explanation}</Text>
              ) : null}
            </View>
          </Row>
        </Card>
      ))}

      {!result.passed ? (
        <AppButton
          label="Try the quiz again"
          onPress={() => navigation.replace('Quiz', { lessonId: route.params.lessonId })}
          style={{ marginTop: spacing.lg }}
        />
      ) : null}
      <AppButton
        label="Back to my courses"
        variant={result.passed ? 'primary' : 'secondary'}
        onPress={() => navigation.navigate('Tabs')}
        style={{ marginTop: spacing.sm }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  emoji: { fontSize: 44 },
  score: { fontSize: 48, fontWeight: '800', color: colors.text, marginTop: spacing.sm },
  headline: { ...typography.heading, marginTop: spacing.xs },
  sub: { ...typography.caption, marginTop: 2 },
  xpBadge: {
    marginTop: spacing.lg,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.lg,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  xpBadgeText: { color: '#241B00', fontWeight: '700' },
  bonusCard: { borderColor: colors.accent },
  bonusTitle: { ...typography.heading },
  bonusBody: { ...typography.body, color: colors.textMuted, marginTop: 2 },
  levelLabel: { ...typography.label, color: colors.text },
  levelHint: { ...typography.caption, marginTop: spacing.sm },
  sectionTitle: { ...typography.heading, marginTop: spacing.lg, marginBottom: spacing.md },
  mark: { fontSize: 16, marginRight: spacing.md },
  question: { ...typography.body },
  explanation: { ...typography.caption, marginTop: spacing.xs, color: colors.textMuted },
});
