import { createContext } from 'preact';
import { useContext } from 'preact/hooks';

export const OrderEditContext = createContext({
  notifyUpdateSuccess: () => {},
  triggerTopPageRefresh: () => {},
  isCancelled: false,
  setIsCancelled: () => {},
  isUpdating: false,
  setIsUpdating: () => {},
  openModalId: null,
  setOpenModalId: () => {},
  needsRefresh: false,
  startRefreshCountdown: () => {},
});

export const useOrderEdit = () => useContext(OrderEditContext);
