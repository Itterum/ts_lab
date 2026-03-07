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

export type ClickupAttribute = 'bold' | 'italic' | 'underline' | 'strikethrough' | 'code' | 'link';

export type ClickupTextNode = {
    text: string;
    attributes?: ClickupAttribute[];
    link?: string;
};

export type ClickupAttachmentNode = {
    type: 'attachment';
    text: string;
    attachment: {
        name: string;
        title: string;
        type: string;
        extension: string;
        url: string;
        uploaded: true;
    };
};

export type ClickupNode = ClickupTextNode | ClickupAttachmentNode;

export type ClickupCommentPayload = {
    comment: ClickupNode[];
};

export type EntityParser = (text: string, entities?: MessageEntity[]) => ClickupTextNode[];

export type TelegramToClickup = (post: Post) => ClickupCommentPayload;

export const entityMap: Record<TelegramFormatting, ClickupAttribute> = {
    bold: 'bold',
    italic: 'italic',
    underline: 'underline',
    strikethrough: 'strikethrough',
    code: 'code',
    pre: 'code',
    spoiler: 'italic',
    text_link: 'link',
};
