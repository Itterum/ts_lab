type MediaItem = {
    media_group_id: string;
    text?: string;
    photos: string[];
};

type GroupedMediaItem = {
    media_group_id: string;
    text?: string;
    photos: string[];
};

const test = [
    {
        media_group_id: '14178214848433418',
        text: '⚡️В твиттере новая теория заговора\n\nТысячи людей делают посты о том, что Джима Керри подменили. Всё из-за того, что он много лет высказывался про педофильский заговор Эпштейна. Его убили и заменили двойником\n\nЧто думаем? 4ch',
        photos: [
            'https://api.telegram.org/file/bot8227021522:AAHBlWpluWQVsHtWDVg7a6NKMtBtDZR0xbc/photos/file_2.jpg',
        ],
    },
    {
        media_group_id: '14178214848433418',
        text: undefined,
        photos: [
            'https://api.telegram.org/file/bot8227021522:AAHBlWpluWQVsHtWDVg7a6NKMtBtDZR0xbc/photos/file_3.jpg',
        ],
    },
];

const map = new Map<string, GroupedMediaItem>();

for (const item of test) {
    const existing = map.get(item.media_group_id);

    if (existing) {
        if (item.text && !existing.text) {
            existing.text = item.text;
        }
        existing.photos.push(...item.photos);
    } else {
        map.set(item.media_group_id, {
            media_group_id: item.media_group_id,
            text: item.text,
            photos: [...item.photos],
        });
    }
}

const grouped = Array.from(map.values());

console.log(grouped);
