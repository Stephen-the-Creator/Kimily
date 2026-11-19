// Temporary file shelf ("Ablage") inside the Dynamic Island for staging dropped files between apps or sending to Nook.

export interface TrayFile {
  id: string;
  name: string;
  size: number;
  type: string;
  previewUrl: string | null;
  file: File;
}

class FileTray {
  items = $state<TrayFile[]>([]);

  get count(): number {
    return this.items.length;
  }

  addFiles(list: FileList | File[]) {
    const incoming = Array.from(list);
    if (!incoming.length) return;
    const added: TrayFile[] = incoming.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: file.name,
      size: file.size,
      type: file.type,
      previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
      file,
    }));
    this.items = [...added, ...this.items];
  }

  remove(id: string) {
    const target = this.items.find((i) => i.id === id);
    if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
    this.items = this.items.filter((i) => i.id !== id);
  }

  clear() {
    for (const item of this.items) {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    }
    this.items = [];
  }
}

export const fileTray = new FileTray();
