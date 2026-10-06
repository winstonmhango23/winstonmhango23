/**
 * Production error boundary component for graceful error handling.
 * Catches rendering errors and displays user-friendly recovery UI.
 */

import { ThemedText } from '@/components/themed-text';
import { CoFiColors } from '@/constants/theme';
import { logger } from '@/lib/logger';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  /** Called when a child render error is caught (e.g. switch Properties Map to list mode). */
  onError?: (error: Error) => void;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: React.ErrorInfo;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    this.setState({ errorInfo });
    this.props.onError?.(error);
    logger.error(
      `React component error: ${errorInfo.componentStack}`,
      error,
      { module: 'error-boundary' }
    );
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <View style={styles.container}>
            <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
              <View style={styles.iconContainer}>
                <MaterialIcons name="error-outline" size={64} color={CoFiColors.destructive} />
              </View>

              <ThemedText
                type="title"
                style={styles.title}
                lightColor={CoFiColors.foreground}
                darkColor={CoFiColors.dark.foreground}
              >
                Something went wrong
              </ThemedText>

              <ThemedText
                style={styles.message}
                lightColor={CoFiColors.mutedForeground}
                darkColor={CoFiColors.dark.mutedForeground}
              >
                The app encountered an unexpected error. Please try again or contact support if the problem persists.
              </ThemedText>

              {__DEV__ && this.state.error && (
                <View style={styles.errorBox}>
                  <ThemedText
                    style={styles.errorTitle}
                    lightColor={CoFiColors.destructive}
                    darkColor={CoFiColors.destructive}
                  >
                    Error Details (Dev Only):
                  </ThemedText>
                  <ThemedText
                    style={styles.errorText}
                    lightColor={CoFiColors.foreground}
                    darkColor={CoFiColors.dark.foreground}
                  >
                    {this.state.error.message}
                  </ThemedText>
                  {this.state.errorInfo && (
                    <ThemedText
                      style={styles.stackTrace}
                      lightColor={CoFiColors.mutedForeground}
                      darkColor={CoFiColors.dark.mutedForeground}
                    >
                      {this.state.errorInfo.componentStack}
                    </ThemedText>
                  )}
                </View>
              )}
            </ScrollView>
          </View>
        )
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CoFiColors.background,
  },
  scroll: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  iconContainer: {
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },
  errorBox: {
    backgroundColor: CoFiColors.muted,
    borderRadius: 8,
    padding: 16,
    marginTop: 16,
    width: '100%',
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  errorText: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 8,
    fontFamily: 'monospace',
  },
  stackTrace: {
    fontSize: 10,
    lineHeight: 14,
    fontFamily: 'monospace',
  },
});
