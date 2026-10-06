import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';

import { VisibleScrollbarScrollView } from '@/components/ui/visible-scrollbar-scroll-view';

describe('VisibleScrollbarScrollView', () => {
  it('renders scrollable staff content', () => {
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <VisibleScrollbarScrollView testID="staff-scroll">
          <Text>Draft loan details</Text>
        </VisibleScrollbarScrollView>
      );
    });

    expect(tree!.root.findByProps({ testID: 'staff-scroll' })).toBeTruthy();
    expect(tree!.root.findByType(Text).props.children).toBe('Draft loan details');
  });
});
