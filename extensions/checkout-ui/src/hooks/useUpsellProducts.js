import { useState, useEffect, useCallback } from 'preact/hooks';
import { getUpsellTags, getOrderDetails } from '../utils/api';
import { getExtensionLines, getExtensionOrderId, formatOrderId } from '../utils/shopifyHelpers';

/**
 * GraphQL query against the Storefront API to find products matching tags.
 */
const PRODUCTS_BY_TAG_QUERY = `#graphql
  query SearchProductsByTag($query: String!, $first: Int!) {
    products(first: $first, query: $query) {
      nodes {
        id
        title
        featuredImage {
          url
          altText
        }
        variants(first: 10) {
          nodes {
            id
            title
            availableForSale
            selectedOptions {
              name
              value
            }
            price {
              amount
              currencyCode
            }
          }
        }
      }
    }
  }
`;

const FALLBACK_PRODUCTS_QUERY = `#graphql
  query SearchPopularProducts($first: Int!) {
    products(first: $first) {
      nodes {
        id
        title
        featuredImage {
          url
          altText
        }
        variants(first: 10) {
          nodes {
            id
            title
            availableForSale
            selectedOptions {
              name
              value
            }
            price {
              amount
              currencyCode
            }
          }
        }
      }
    }
  }
`;

/**
 * Fetches upsell product recommendations based on tags of active order items.
 *
 * Rules:
 * 1. If upshell products for the products from order are available (tag-matched)
 *    and not yet in the order, show ONLY those upshell products.
 * 2. When upshell products for the order products are not available (no tags found,
 *    or all tag-matched products have already been added to the order),
 *    show the default fallback upshell products instead of hiding the upshell feature.
 */
export function useUpsellProducts(initialOrderId) {
  const normalizedInitial = formatOrderId(initialOrderId);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [resolvedOrderId, setResolvedOrderId] = useState(normalizedInitial || getExtensionOrderId());
  const [locallyAddedIds, setLocallyAddedIds] = useState([]);

  const addExcludedProductId = useCallback((id) => {
    if (!id) return;
    setLocallyAddedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  useEffect(() => {
    let active = true;
    let attempts = 0;
    const maxAttempts = 30;

    const normalized = formatOrderId(initialOrderId);
    if (normalized) {
      setResolvedOrderId(normalized);
      return;
    }

    const currentId = getExtensionOrderId();
    if (currentId) {
      setResolvedOrderId(currentId);
      return;
    }

    const interval = setInterval(() => {
      attempts++;
      const foundId = getExtensionOrderId();
      if (foundId && active) {
        setResolvedOrderId(foundId);
        clearInterval(interval);
      } else if (attempts >= maxAttempts && active) {
        clearInterval(interval);
      }
    }, 300);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [initialOrderId]);

  const fetchUpsells = useCallback(async () => {
    if (!resolvedOrderId) return;

    setLoading(true);
    setError(null);

    try {
      // Step 1: Collect all product IDs currently in the customer's order
      const orderProductIds = new Set(locallyAddedIds);

      const lines = getExtensionLines();
      for (const line of lines) {
        const prodId = line.merchandise?.product?.id;
        if (prodId && (line.currentQuantity !== 0 && line.quantity !== 0)) {
          orderProductIds.add(prodId);
        }
      }

      // Check live order details from backend Admin API
      try {
        const orderData = await getOrderDetails({ orderId: resolvedOrderId });
        if (orderData?.lineItems?.length) {
          for (const item of orderData.lineItems) {
            const prodId = item.merchandise?.product?.id;
            if (prodId && (item.currentQuantity ?? item.quantity) !== 0) {
              orderProductIds.add(prodId);
            }
          }
        }
      } catch (detailsErr) {
        console.warn('[useUpsellProducts] getOrderDetails fallback:', detailsErr);
      }

      // Step 2: Try fetching upshell products for the products from the order (tag-matched)
      let tagMatchedAvailable = [];
      try {
        const { tags } = await getUpsellTags({ orderId: resolvedOrderId });

        if (tags && tags.length > 0) {
          const tagQuery = tags.map((t) => `tag:"${t}"`).join(' OR ');
          const { data, errors } = await shopify.query(PRODUCTS_BY_TAG_QUERY, {
            variables: { query: tagQuery, first: 12 },
          });
          if (!errors?.length && data?.products?.nodes) {
            tagMatchedAvailable = data.products.nodes.filter(
              (p) => !orderProductIds.has(p.id) && p.variants?.nodes?.some((v) => v.availableForSale)
            );
          }
        }
      } catch (tagErr) {
        console.warn('[useUpsellProducts] Tag query failed:', tagErr);
      }

      // Step 3:
      // - If upshell products for the products from order are available then show the upshell products only.
      // - And when the upshell products for the product from order is not available then show the default fallback upshell products only.
      let finalProducts = [];
      if (tagMatchedAvailable.length > 0) {
        finalProducts = tagMatchedAvailable;
      } else {
        try {
          const { data, errors } = await shopify.query(FALLBACK_PRODUCTS_QUERY, {
            variables: { first: 20 },
          });
          if (!errors?.length && data?.products?.nodes) {
            finalProducts = data.products.nodes.filter(
              (p) => !orderProductIds.has(p.id) && p.variants?.nodes?.some((v) => v.availableForSale)
            );
          }
        } catch (fallbackErr) {
          console.warn('[useUpsellProducts] Fallback query failed:', fallbackErr);
        }
      }

      setProducts(finalProducts);
    } catch (err) {
      console.error('[useUpsellProducts] Error:', err);
      setError(err instanceof Error ? err.message : 'Could not load recommendations.');
    } finally {
      setLoading(false);
    }
  }, [resolvedOrderId, locallyAddedIds]);

  useEffect(() => {
    fetchUpsells();
  }, [fetchUpsells]);

  return { products, loading, error, resolvedOrderId, refetch: fetchUpsells, addExcludedProductId };
}
