declare module 'react-native-push-notification' {
  export interface PushNotification {
    configure(options: any): void;
    localNotification(details: any): void;
    localNotificationSchedule(details: any): void;
    cancelLocalNotification(id: string): void;
    cancelAllLocalNotifications(): void;
    getScheduledLocalNotifications(callback: (notifications: any[]) => void): void;
    createChannel(channelConfig: any, callback: (created: boolean) => void): void;
  }

  export enum Importance {
    DEFAULT = 3,
    HIGH = 4,
    LOW = 2,
    MIN = 1,
    NONE = 0,
  }

  const pushNotification: PushNotification;
  export default pushNotification;
}
