import { createContext } from 'preact';
import { useContext } from 'preact/hooks';

export const OrderEditContext = createContext({
  notifyUpdateSuccess: () => {},
  triggerTopPageRefresh: () => {},
  isCancelled: false,
  setIsCancelled: () => {},
});

export const useOrderEdit = () => useContext(OrderEditContext);
