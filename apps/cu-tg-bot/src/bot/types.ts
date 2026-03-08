import { Audio, Document, MessageEntity, PhotoSize, Video, Voice } from 'node-telegram-bot-api';

export type TelegramMedia =
    | { type: 'photo'; data: PhotoSize[] }
    | { type: 'video'; data: Video }
    | { type: 'audio'; data: Audio }
    | { type: 'voice'; data: Voice }
    | { type: 'document'; data: Document };

export type Post = {
    id: string;

    text: string | null;
    entities: MessageEntity[] | null;

    media: TelegramMedia[];

    date?: number;
    chatId?: number;
    messageId?: number;
};

export type TelegramEntityType = MessageEntity['type'];

export type TelegramFormatting = Extract<
    TelegramEntityType,
    'bold' | 'italic' | 'underline' | 'strikethrough' | 'spoiler' | 'code' | 'pre' | 'text_link'
>;

export type ClickupAttribute = {
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    strike?: boolean;
    code?: boolean;
    link?: string;
    'block-id'?: string;
};

export type ClickupTextNode = {
    text: string;
    attributes?: ClickupAttribute;
};

export type ClickupImageAttachmentNode = {
    type: 'image';
    text: string;
    image: {
        name: string;
        title: string;
        type: string;
        extension: string;
        url?: string;
        uploaded: true;
    };
};

export type ClickupAttachmentNode = {
    type: 'attachment';
    text: string;
    attachment: {
        name: string;
        title: string;
        type: string;
        extension: string;
        url?: string;
        uploaded: true;
    };
};

export type ClickupNode = ClickupTextNode | ClickupAttachmentNode | ClickupImageAttachmentNode;

export type ClickupCommentPayload = {
    comment: ClickupNode[];
};
