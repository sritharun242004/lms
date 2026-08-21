/** @vitest-environment jsdom */

import { createElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditableAvatar } from './editable-avatar';

afterEach(cleanup);

describe('EditableAvatar', () => {
  it('offers add photo to a manager without a photo', () => {
    render(createElement(EditableAvatar, { name: 'Asha Coach', canManage: true }));
    expect(screen.getByRole('button', { name: 'Add Asha Coach photo' })).toBeTruthy();
  });

  it('offers view, change, and remove to a manager with a photo', () => {
    render(createElement(EditableAvatar, { name: 'Asha Coach', imageUrl: '/photo?v=1', canManage: true, onRemove: vi.fn() }));
    expect(screen.getByRole('button', { name: 'View Asha Coach photo' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Change Asha Coach photo' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove Asha Coach photo' })).toBeTruthy();
  });

  it('keeps a participant view-only', () => {
    render(createElement(EditableAvatar, { name: 'Participant One', imageUrl: '/photo?v=1', canManage: false }));
    expect(screen.getByRole('button', { name: 'View Participant One photo' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /change participant/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /remove participant/i })).toBeNull();
  });
});
