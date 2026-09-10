import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { API_BASE_URL, loadToken } from '../../api/client';
import { fetchLesson, saveLessonProgress } from '../../api/endpoints';
import type { LessonDetail } from '../../api/types';
import { AppButton, Card, ErrorView, LoadingView, Pill, Row, Screen, formatDuration } from '../../components';
import type { RootStackParamList } from '../../navigation/types';
import { colors, radius, spacing, typography } from '../../theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** How often the watched position is sent to the server. */
const HEARTBEAT_MS = 10_000;

export function LessonPlayerScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'LessonPlayer'>>();
  const navigation = useNavigation<Nav>();
  const { lessonId } = route.params;

  const [detail, setDetail] = useState<LessonDetail | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [watched, setWatched] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [data, storedToken] = await Promise.all([fetchLesson(lessonId), loadToken()]);
        if (cancelled) return;
        setDetail(data);
        setToken(storedToken);
        setWatched(data.progress.status !== 'in_progress' && data.progress.status !== 'not_started');
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not open this lesson');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lessonId]);

  if (error) return <ErrorView message={error} onRetry={() => navigation.goBack()} />;
  if (!detail) return <LoadingView label="Opening lesson…" />;

  return (
    <Screen scroll padded={false}>
      {detail.playback.kind === 'stream' && token ? (
        <NativeVideo detail={detail} token={token} onWatched={() => setWatched(true)} />
      ) : (
        <DrivePreview detail={detail} onWatched={() => setWatched(true)} />
      )}

      <View style={styles.body}>
        <Text style={styles.courseName}>{detail.course.coverEmoji}  {detail.course.title}</Text>
        <Text style={styles.title}>{detail.lesson.title}</Text>
        <Row style={{ marginTop: spacing.sm, flexWrap: 'wrap' }}>
          {detail.lesson.durationSeconds ? <Pill label={formatDuration(detail.lesson.durationSeconds)} /> : null}
          {watched ? <Pill label="Watched" tone="success" /> : <Pill label="In progress" tone="primary" />}
          {detail.quiz ? (
            <Pill
              label={detail.quiz.questionCount ? `Quiz · +${detail.quiz.xpReward} XP` : 'Quiz coming soon'}
              tone={detail.quiz.questionCount ? 'warning' : 'neutral'}
            />
          ) : null}
        </Row>

        {detail.quiz && detail.quiz.questionCount > 0 ? (
          <Card style={{ marginTop: spacing.xl }}>
            <Text style={styles.quizTitle}>{detail.quiz.title}</Text>
            <Text style={styles.quizBody}>
              {detail.quiz.questionCount} question{detail.quiz.questionCount === 1 ? '' : 's'} · pass at{' '}
              {detail.quiz.passScore}% · worth up to {detail.quiz.xpReward} XP.
            </Text>
            <AppButton
              label={watched ? 'Take the quiz' : 'Finish the video first'}
              disabled={!watched}
              onPress={() => navigation.navigate('Quiz', { lessonId: detail.lesson.id })}
            />
          </Card>
        ) : detail.quiz ? (
          <Card style={{ marginTop: spacing.xl }}>
            <Text style={styles.quizTitle}>Quiz on the way</Text>
            <Text style={styles.quizBody}>
              Your HR Business Partner is still writing the questions for this video. Watching it is enough for now.
            </Text>
          </Card>
        ) : null}

        {detail.nextLessonId ? (
          <AppButton
            label="Next lesson"
            variant="secondary"
            onPress={() => navigation.replace('LessonPlayer', { lessonId: detail.nextLessonId! })}
            style={{ marginTop: spacing.md }}
          />
        ) : null}
      </View>
    </Screen>
  );
}

/**
 * Native playback of the Drive file, proxied by the API.
 * The player seeks to the stored position on open, and the position is written
 * back on a heartbeat and again on the way out — that is what makes "leave
 * mid-way and pick up where you left off" work.
 */
function NativeVideo({
  detail,
  token,
  onWatched,
}: {
  detail: LessonDetail;
  token: string;
  onWatched: () => void;
}) {
  const startAt = detail.progress.positionSeconds;
  const source = useMemo(
    () => ({ uri: `${API_BASE_URL}${detail.playback.url}`, headers: { Authorization: `Bearer ${token}` } }),
    [detail.playback.url, token],
  );

  const player = useVideoPlayer(source, (instance) => {
    instance.timeUpdateEventInterval = 1;
    if (startAt > 0) instance.currentTime = startAt;
  });

  const latest = useRef({ position: startAt, duration: detail.progress.durationSeconds });

  useEffect(() => {
    const timeSub = player.addListener('timeUpdate', (payload) => {
      latest.current = { position: payload.currentTime, duration: player.duration || latest.current.duration };
    });
    const endSub = player.addListener('playToEnd', () => {
      onWatched();
      void saveLessonProgress(detail.lesson.id, player.duration, player.duration, true);
    });
    return () => {
      timeSub.remove();
      endSub.remove();
    };
  }, [player, detail.lesson.id, onWatched]);

  // Heartbeat while watching, plus a final write when the screen goes away.
  useEffect(() => {
    const interval = setInterval(() => {
      const { position, duration } = latest.current;
      if (position > 0) void saveLessonProgress(detail.lesson.id, position, duration).catch(() => undefined);
    }, HEARTBEAT_MS);

    return () => {
      clearInterval(interval);
      const { position, duration } = latest.current;
      if (position > 0) void saveLessonProgress(detail.lesson.id, position, duration).catch(() => undefined);
    };
  }, [detail.lesson.id]);

  return (
    <View style={styles.playerWrap}>
      <VideoView
        style={styles.player}
        player={player}
        nativeControls
        allowsPictureInPicture
        fullscreenOptions={{ enable: true }}
      />
      {startAt > 0 ? <Text style={styles.resumeHint}>Resumed from {formatDuration(startAt)}</Text> : null}
    </View>
  );
}

/**
 * Fallback for Drive items the API cannot stream directly (no service-account
 * credentials configured, or a Google-native file). The embed has no playback
 * events to listen to, so time on screen is counted and the rep confirms.
 */
function DrivePreview({ detail, onWatched }: { detail: LessonDetail; onWatched: () => void }) {
  const [seconds, setSeconds] = useState(detail.progress.positionSeconds);
  const secondsRef = useRef(seconds);
  const duration = detail.lesson.durationSeconds || detail.progress.durationSeconds || 0;

  useEffect(() => {
    const tick = setInterval(() => {
      secondsRef.current += 1;
      setSeconds(secondsRef.current);
    }, 1000);
    const heartbeat = setInterval(() => {
      void saveLessonProgress(detail.lesson.id, secondsRef.current, duration).catch(() => undefined);
    }, HEARTBEAT_MS);

    return () => {
      clearInterval(tick);
      clearInterval(heartbeat);
      void saveLessonProgress(detail.lesson.id, secondsRef.current, duration).catch(() => undefined);
    };
  }, [detail.lesson.id, duration]);

  const markWatched = useCallback(async () => {
    await saveLessonProgress(detail.lesson.id, secondsRef.current, duration || secondsRef.current, true);
    onWatched();
  }, [detail.lesson.id, duration, onWatched]);

  return (
    <View>
      <View style={styles.playerWrap}>
        <WebView
          source={{ uri: detail.playback.url }}
          style={styles.player}
          allowsFullscreenVideo
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled
        />
      </View>
      <View style={styles.previewBar}>
        <Text style={styles.previewText}>
          Watching for {formatDuration(seconds)}
          {duration ? ` of ${formatDuration(duration)}` : ''}
        </Text>
        <AppButton label="I've finished watching" variant="secondary" onPress={() => void markWatched()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  playerWrap: { backgroundColor: '#000', aspectRatio: 16 / 9, width: '100%' },
  player: { width: '100%', height: '100%', backgroundColor: '#000' },
  resumeHint: {
    position: 'absolute',
    bottom: spacing.sm,
    left: spacing.md,
    ...typography.caption,
    color: colors.white,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  previewBar: { padding: spacing.lg, gap: spacing.md, backgroundColor: colors.surfaceAlt },
  previewText: { ...typography.label, color: colors.textMuted },
  body: { padding: spacing.lg },
  courseName: { ...typography.caption, marginBottom: spacing.xs },
  title: { ...typography.title },
  quizTitle: { ...typography.heading, marginBottom: spacing.xs },
  quizBody: { ...typography.body, color: colors.textMuted, marginBottom: spacing.lg },
});
