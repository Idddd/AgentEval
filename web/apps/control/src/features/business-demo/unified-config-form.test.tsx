/** @vitest-environment jsdom */
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { UnifiedConfigForm } from './unified-config-form';
import { emptyConfig } from './evaluation';
import { NEMO_POLICY_SAMPLE, parseNemoPolicy } from '../nmgr/nemo-policy';

afterEach(cleanup);
function Editor({ content = '', format = 'nemo-policy' as 'nemo-policy' | 'prompt' }) {
  const [config, setConfig] = useState({ ...emptyConfig(), content });
  return <UnifiedConfigForm config={config} onChange={setConfig} sources={[]} onSources={() => {}} customFormat={format} customSample={NEMO_POLICY_SAMPLE} />;
}
it('shows a sample as a placeholder and fills it on plain Tab only when empty', () => {
  render(<Editor />);
  const editor = screen.getByRole('textbox', { name: 'NeMo Policy JSON' }) as HTMLTextAreaElement;
  expect(editor.value).toBe('');
  expect(editor.placeholder).toBe(NEMO_POLICY_SAMPLE);
  expect(fireEvent.keyDown(editor, { key: 'Tab', shiftKey: true })).toBe(true);
  expect(editor.value).toBe('');
  expect(fireEvent.keyDown(editor, { key: 'Tab' })).toBe(false);
  expect(editor.value).toBe(NEMO_POLICY_SAMPLE);
  expect(parseNemoPolicy(editor.value, true).tests).toHaveLength(2);
  expect(fireEvent.keyDown(editor, { key: 'Tab' })).toBe(true);
});
it('preserves existing content and only fills an empty editor with Tab', () => {
  render(<Editor content="Existing user instructions" />);
  const editor = screen.getByRole('textbox', { name: 'NeMo Policy JSON' }) as HTMLTextAreaElement;
  expect(fireEvent.keyDown(editor, { key: 'Tab' })).toBe(true);
  expect(editor.value).toBe('Existing user instructions');
  fireEvent.change(editor, { target: { value: '' } });
  fireEvent.keyDown(editor, { key: 'Tab' });
  expect(editor.value).toBe(NEMO_POLICY_SAMPLE);
});
it('does not change Tab behavior or show NeMo samples for F5/V2 prompts', () => {
  render(<Editor format="prompt" />);
  const editor = screen.getByRole('textbox', { name: /LLM prompt/ }) as HTMLTextAreaElement;
  expect(fireEvent.keyDown(editor, { key: 'Tab' })).toBe(true);
  expect(editor.value).toBe('');
  expect(screen.queryByRole('button', { name: 'Insert sample JSON' })).toBeNull();
});
