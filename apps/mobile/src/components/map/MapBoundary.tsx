import { Component, type ReactNode } from 'react';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { reportError } from '@/lib/errors';
import { mapColors } from '@/lib/mapStyle';
import { fonts, night } from '@/lib/theme';

/** If the map itself breaks, the page around it (booking form, ride details) keeps working on a plain night background. */
export class MapBoundary extends Component<{ children: ReactNode; style?: StyleProp<ViewStyle>; label: string }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    reportError(error, 'map');
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <View style={[{ backgroundColor: mapColors.land, alignItems: 'center', justifyContent: 'center' }, this.props.style]}>
        <Text style={{ fontFamily: fonts.body, fontSize: 13, color: night.muted }}>{this.props.label}</Text>
      </View>
    );
  }
}
