import { App, MarkdownView, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';

interface DailySummarySettings {
	apiKey: string;
	model: string;
	addHeader: boolean;
}

const DEFAULT_SETTINGS: DailySummarySettings = {
	apiKey: '',
	model: 'gemini-pro',
	addHeader: true
}

export default class DailySummaryPlugin extends Plugin {
	settings: DailySummarySettings;

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new DailySummarySettingTab(this.app, this));

		this.addCommand({
			id: 'generate-daily-summary',
			name: 'Generate Daily Summary from Note',
			callback: () => this.generateSummary(),
		});
	}

	async generateSummary() {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) {
			new Notice('No active Markdown note');
			return;
		}

		const file = view.file;
		if (!file) {
			new Notice('No active file');
			return;
		}

		const originalContent = await this.app.vault.read(file);
		if (!originalContent || originalContent.trim().length === 0) {
			new Notice('Note is empty');
			return;
		}

		const prompt = this.buildPrompt(originalContent);

		let summary = '';
		try {
			summary = await this.queryGemini(prompt);
		} catch (error) {
			console.error(error);
			new Notice('Gemini request failed');
			return;
		}

		const header = this.settings.addHeader ? '\n\n---\n### 🧾 Daily Summary\n' : '\n\n';
		const updated = `${originalContent}${header}${summary}`;
		await this.app.vault.modify(file, updated);
		new Notice('Daily summary inserted');
	}

	buildPrompt(content: string): string {
		return [
			'You are a helpful assistant that restructures daily activity logs.',
			'Convert the following freeform day log into a concise Markdown table.',
			'Columns: Time, Activity, Notes.',
			'Follow rules:',
			'- Normalize times (e.g., 7:30 -> 7:30 AM).',
			'- For ranges, infer start–end when possible.',
			'- Keep notes short and remove exclamations/emojis unless meaningful.',
			'- Output ONLY a Markdown table, no extra text before/after.',
			'',
			content
		].join('\n');
	}

	async queryGemini(prompt: string): Promise<string> {
		const apiKey = this.settings.apiKey?.trim();
		if (!apiKey) {
			throw new Error('Missing Gemini API key. Please set it in settings.');
		}

		const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.settings.model}:generateContent?key=${encodeURIComponent(apiKey)}`;

		const res = await fetch(endpoint, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				contents: [
					{ parts: [{ text: prompt }] }
				]
			})
		});

		if (!res.ok) {
			const text = await res.text();
			throw new Error(`Gemini error: ${res.status} ${text}`);
		}

		const data = await res.json();
		const output: string = data?.candidates?.[0]?.content?.parts?.[0]?.text;
		if (!output) {
			throw new Error('Gemini returned no content');
		}
		return output;
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class DailySummarySettingTab extends PluginSettingTab {
	plugin: DailySummaryPlugin;

	constructor(app: App, plugin: DailySummaryPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();
		containerEl.createEl('h2', { text: 'Gemini API Settings' });

		new Setting(containerEl)
			.setName('API Key')
			.setDesc('Enter your Google Gemini API key')
			.addText(text =>
				text
					.setPlaceholder('API Key')
					.setValue(this.plugin.settings.apiKey)
					.onChange(async (value) => {
						this.plugin.settings.apiKey = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Model')
			.setDesc('Gemini model to use (default gemini-pro)')
			.addText(text =>
				text
					.setPlaceholder('gemini-pro')
					.setValue(this.plugin.settings.model)
					.onChange(async (value) => {
						this.plugin.settings.model = value || 'gemini-pro';
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Add header before table')
			.setDesc('Insert a "🧾 Daily Summary" header before the table')
			.addToggle(toggle =>
				toggle
					.setValue(this.plugin.settings.addHeader)
					.onChange(async (value) => {
						this.plugin.settings.addHeader = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
